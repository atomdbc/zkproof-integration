"use client";

import {
  StarknetWalletApi,
  useConnect,
  WalletConnectModal,
} from "@starknet-io/get-starknet-ui";
import {
  assertProofActionEnvelope,
  buildProofActionConsumerCall,
  decodeProofActionEnvelope,
  generateGroth16Proof,
  prepareGroth16ProofForStarknet,
  verifyGroth16ProofLocal,
  type CircuitManifest,
  type Groth16VerificationKey,
  type VerifierBuildManifest,
} from "@starkcircom/sdk";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleDot,
  Copy,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  Network,
  RefreshCw,
  ShieldCheck,
  Unplug,
  WalletCards,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CallData,
  constants,
  defaultDeployer,
  hash,
  RpcProvider,
  type Abi,
  type CompiledSierra,
  type CompiledSierraCasm,
} from "starknet";
import { createRecallActionInput, randomFieldSecret } from "@/lib/recall-action";

const SEPOLIA_RPC = "https://starknet-sepolia-rpc.publicnode.com";
const SEPOLIA_EXPLORER = "https://sepolia.voyager.online";
const SEPOLIA_FAUCET = "https://starknet-faucet.vercel.app";
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

type ContractArtifact = {
  classHash: string;
  compiledClassHash: string;
  sierra: CompiledSierra;
  casm: CompiledSierraCasm;
  abi: Abi;
};

type ArtifactBundle = {
  circuitManifest: CircuitManifest;
  verificationKey: Groth16VerificationKey;
  provingArtifacts: { wasm: string; zkey: string };
  verifier: {
    manifest: VerifierBuildManifest;
    sierra: CompiledSierra;
    casm: CompiledSierraCasm;
    abi: Abi;
  };
  manifestCommitment: string;
  contracts: {
    ProofActionConsumer: ContractArtifact;
    VerifierRegistry: ContractArtifact;
  };
};

type TransactionResponse = { transaction_hash: string; class_hash?: string };
type LogEntry = { id: string; message: string; tone: "info" | "success" | "error"; transactionHash?: string };
type TransactionRecord = {
  id: string;
  stage: string;
  transactionHash: string;
  status: "confirmed";
};

type StackAddresses = {
  verifier?: string;
  registry?: string;
  consumer?: string;
};

function transactionResponse(value: unknown): TransactionResponse {
  if (!value || typeof value !== "object" || !("transaction_hash" in value)) {
    throw new Error("The wallet returned an unexpected transaction response.");
  }
  const result = value as Record<string, unknown>;
  if (typeof result.transaction_hash !== "string") throw new Error("The wallet returned no transaction hash.");
  return {
    transaction_hash: result.transaction_hash,
    ...(typeof result.class_hash === "string" ? { class_hash: result.class_hash } : {}),
  };
}

function salt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function u256(value: bigint): [bigint, bigint] {
  const lowMask = (1n << 128n) - 1n;
  return [value & lowMask, value >> 128n];
}

function short(value?: string): string {
  if (!value) return "Pending";
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function formatStrk(value?: bigint): string {
  if (value === undefined) return "Checking";
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole.toLocaleString()}${fraction ? `.${fraction}` : ""} STRK`;
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function isClassHashNotFound(cause: unknown): boolean {
  if (!cause || typeof cause !== "object" || !("baseError" in cause)) return false;
  const baseError = (cause as { baseError?: unknown }).baseError;
  return Boolean(
    baseError &&
      typeof baseError === "object" &&
      "code" in baseError &&
      (baseError as { code: unknown }).code === 28,
  );
}

function walletContractClass(sierra: CompiledSierra) {
  return {
    ...sierra,
    abi: typeof sierra.abi === "string" ? sierra.abi : JSON.stringify(sierra.abi),
  };
}

export function ActionConsole() {
  const { connected, disconnect } = useConnect();
  const account = connected?.accounts[0];
  const walletApi = connected?.features[StarknetWalletApi];
  const provider = useMemo(() => new RpcProvider({ nodeUrl: SEPOLIA_RPC }), []);
  const ownerSecret = useRef<bigint>(randomFieldSecret());
  const loaded = useRef(false);

  const [artifacts, setArtifacts] = useState<ArtifactBundle>();
  const [declared, setDeclared] = useState<Record<string, boolean>>({});
  const [addresses, setAddresses] = useState<StackAddresses>({});
  const [chainId, setChainId] = useState<string>();
  const [restoredFor, setRestoredFor] = useState<string>();
  const [registered, setRegistered] = useState(false);
  const [localChecked, setLocalChecked] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [strkBalance, setStrkBalance] = useState<bigint>();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  const log = useCallback((
    message: string,
    tone: LogEntry["tone"] = "info",
    transactionHash?: string,
  ) => {
    setLogs((current) => [
      ...current.slice(-24),
      { id: crypto.randomUUID(), message, tone, transactionHash },
    ]);
  }, []);

  const confirmTransaction = useCallback(async (stage: string, transactionHash: string) => {
    log(`${stage} submitted. Waiting for Sepolia confirmation.`, "info", transactionHash);
    await provider.waitForTransaction(transactionHash);
    setTransactions((current) => [
      ...current,
      { id: crypto.randomUUID(), stage, transactionHash, status: "confirmed" },
    ]);
    log(`${stage} confirmed on Sepolia.`, "success", transactionHash);
  }, [log, provider]);

  const refreshBalance = useCallback(async () => {
    if (!account || chainId !== constants.StarknetChainId.SN_SEPOLIA) {
      setStrkBalance(undefined);
      return;
    }
    try {
      const result = await provider.callContract({
        contractAddress: STRK_TOKEN,
        entrypoint: "balanceOf",
        calldata: [account.address],
      });
      setStrkBalance(BigInt(result[0] ?? 0) + (BigInt(result[1] ?? 0) << 128n));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not read the Sepolia STRK balance.";
      log(message, "error");
    }
  }, [account, chainId, log, provider]);

  const load = useCallback(async () => {
    setBusy("Checking reproducible builds");
    setError(undefined);
    try {
      const response = await fetch("/api/action/artifacts", { cache: "no-store" });
      const body = await response.json() as ArtifactBundle | { error: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : "Artifact load failed.");

      const candidates = [
        {
          name: "verifier",
          sierra: body.verifier.sierra,
          casm: body.verifier.casm,
          classHash: body.verifier.manifest.classHash,
          compiledClassHash: body.verifier.manifest.compiledClassHash,
        },
        { name: "consumer", ...body.contracts.ProofActionConsumer },
        { name: "registry", ...body.contracts.VerifierRegistry },
      ];
      for (const candidate of candidates) {
        if (
          hash.computeContractClassHash(candidate.sierra) !== candidate.classHash ||
          hash.computeCompiledClassHash(candidate.casm) !== candidate.compiledClassHash
        ) throw new Error(`${candidate.name} compiled artifacts do not match their manifest.`);
      }

      const hashes = {
        verifier: body.verifier.manifest.classHash,
        consumer: body.contracts.ProofActionConsumer.classHash,
        registry: body.contracts.VerifierRegistry.classHash,
      };
      const statuses: Record<string, boolean> = {};
      for (const [name, classHash] of Object.entries(hashes)) {
        try {
          await provider.getClassByHash(classHash);
          statuses[name] = true;
        } catch (cause) {
          if (!isClassHashNotFound(cause)) throw cause;
          statuses[name] = false;
        }
      }
      setArtifacts(body);
      setDeclared(statuses);
      log("Circuit, verifier, consumer, and registry hashes checked in the browser.", "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not load the action stack.";
      setError(message);
      log(message, "error");
    } finally {
      setBusy(undefined);
    }
  }, [log, provider]);

  useEffect(() => {
    const key = "starkcircom:recall-owner-secret";
    const stored = sessionStorage.getItem(key);
    if (stored) ownerSecret.current = BigInt(stored);
    else sessionStorage.setItem(key, ownerSecret.current.toString());
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    if (!account) {
      setAddresses({});
      setRegistered(false);
      setConsumed(false);
      setTransactions([]);
      setStrkBalance(undefined);
      setRestoredFor(undefined);
      return;
    }
    const stored = sessionStorage.getItem(`starkcircom:recall-stack:${account.address}`);
    const saved = stored ? JSON.parse(stored) as {
      addresses?: StackAddresses;
      registered?: boolean;
      consumed?: boolean;
      transactions?: TransactionRecord[];
    } : {};
    setAddresses(saved.addresses ?? {});
    setRegistered(saved.registered ?? false);
    setConsumed(saved.consumed ?? false);
    setTransactions(saved.transactions ?? []);
    setRestoredFor(account.address);
  }, [account]);

  useEffect(() => {
    if (!account || restoredFor !== account.address || !Object.values(addresses).some(Boolean)) return;
    sessionStorage.setItem(
      `starkcircom:recall-stack:${account.address}`,
      JSON.stringify({ addresses, registered, consumed, transactions }),
    );
  }, [account, addresses, consumed, registered, restoredFor, transactions]);

  useEffect(() => {
    if (!walletApi) {
      setChainId(undefined);
      return;
    }
    void walletApi.request({ type: "wallet_requestChainId" })
      .then((value) => setChainId(String(value)))
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : "Could not read the wallet network.";
        setError(message);
        log(message, "error");
      });
  }, [log, walletApi]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const isSepolia = chainId === constants.StarknetChainId.SN_SEPOLIA;
  const classesReady = declared.verifier && declared.consumer && declared.registry;
  const stackReady = Boolean(addresses.verifier && addresses.registry && addresses.consumer);

  const declareClass = async (
    name: string,
    classHash: string,
    compiledClassHash: string,
    sierra: CompiledSierra,
  ) => {
    if (!walletApi || declared[name]) return;
    log(`Waiting for ${name} declaration approval.`);
    const response = transactionResponse(await walletApi.request({
      type: "wallet_addDeclareTransaction",
      params: {
        class_hash: classHash,
        compiled_class_hash: compiledClassHash,
        contract_class: walletContractClass(sierra),
      },
    }));
    await confirmTransaction(`${name} declaration`, response.transaction_hash);
    await provider.getClassByHash(classHash);
    setDeclared((current) => ({ ...current, [name]: true }));
    await refreshBalance();
  };

  const declareStack = async () => {
    if (!artifacts || !walletApi || !account || !isSepolia) return;
    setBusy("Declaring three reviewed classes");
    setError(undefined);
    try {
      await declareClass(
        "verifier",
        artifacts.verifier.manifest.classHash,
        artifacts.verifier.manifest.compiledClassHash,
        artifacts.verifier.sierra,
      );
      await declareClass(
        "consumer",
        artifacts.contracts.ProofActionConsumer.classHash,
        artifacts.contracts.ProofActionConsumer.compiledClassHash,
        artifacts.contracts.ProofActionConsumer.sierra,
      );
      await declareClass(
        "registry",
        artifacts.contracts.VerifierRegistry.classHash,
        artifacts.contracts.VerifierRegistry.compiledClassHash,
        artifacts.contracts.VerifierRegistry.sierra,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Class declaration stopped.";
      setError(message);
      log(message, "error");
    } finally {
      setBusy(undefined);
    }
  };

  const deploy = async (stage: string, classHash: string, constructorCalldata: string[]) => {
    if (!walletApi || !account) throw new Error("Connect a wallet first.");
    const deployment = defaultDeployer.buildDeployerCall(
      { classHash, constructorCalldata, salt: salt(), unique: true },
      account.address,
    );
    const response = transactionResponse(await walletApi.request({
      type: "wallet_addInvokeTransaction",
      params: {
        calls: deployment.calls.map((call) => ({
          contract_address: call.contractAddress,
          entry_point: call.entrypoint,
          calldata: CallData.compile(call.calldata ?? []),
        })),
      },
    }));
    await confirmTransaction(stage, response.transaction_hash);
    await refreshBalance();
    return deployment.addresses[0] as string;
  };

  const deployStack = async () => {
    if (!artifacts || !account || !classesReady || !isSepolia) return;
    setBusy("Deploying verifier, registry, and consumer");
    setError(undefined);
    try {
      const verifier = addresses.verifier ?? await deploy("Verifier deployment", artifacts.verifier.manifest.classHash, []);
      setAddresses((current) => ({ ...current, verifier }));
      log(`Verifier deployed at ${short(verifier)}.`, "success");

      const registry = addresses.registry ?? await deploy(
        "Registry deployment",
        artifacts.contracts.VerifierRegistry.classHash,
        CallData.compile([account.address]),
      );
      setAddresses((current) => ({ ...current, registry }));
      log(`Registry deployed at ${short(registry)}.`, "success");

      const preview = createRecallActionInput({
        actor: account.address,
        consumer: "0x1",
        ownerSecret: ownerSecret.current,
      });
      const config = preview.publicConfig;
      const consumer = addresses.consumer ?? await deploy(
        "Consumer deployment",
        artifacts.contracts.ProofActionConsumer.classHash,
        CallData.compile([
          verifier,
          config.protocolVersion,
          config.actionId,
          config.policyVersion,
          ...u256(config.policyHash),
          ...u256(config.issuedRoot),
          ...u256(config.affectedRoot),
        ]),
      );
      setAddresses({ verifier, registry, consumer });
      log(`Proof-bound consumer deployed at ${short(consumer)}.`, "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Stack deployment stopped.";
      setError(message);
      log(message, "error");
    } finally {
      setBusy(undefined);
    }
  };

  const registerVerifier = async () => {
    if (!artifacts || !walletApi || !account || !addresses.registry || !addresses.verifier || !addresses.consumer) return;
    setBusy("Registering policy and verifier");
    try {
      const config = createRecallActionInput({
        actor: account.address,
        consumer: addresses.consumer,
        ownerSecret: ownerSecret.current,
      }).publicConfig;
      const response = transactionResponse(await walletApi.request({
        type: "wallet_addInvokeTransaction",
        params: {
          calls: [{
            contract_address: addresses.registry,
            entry_point: "register",
            calldata: CallData.compile([
              ...u256(config.policyHash),
              addresses.verifier,
              artifacts.verifier.manifest.classHash,
              artifacts.manifestCommitment,
              12,
            ]),
          }],
        },
      }));
      await confirmTransaction("Verifier policy registration", response.transaction_hash);
      setRegistered(true);
      await refreshBalance();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Registry update failed.";
      setError(message);
      log(message, "error");
    } finally {
      setBusy(undefined);
    }
  };

  const runLocalProofCheck = async () => {
    if (!artifacts) return;
    setBusy("Proving a private fixture in this browser");
    setError(undefined);
    const startedAt = performance.now();
    try {
      const fixture = createRecallActionInput({
        actor: "0x1234",
        consumer: "0x5678",
        ownerSecret: ownerSecret.current,
      });
      const generated = await generateGroth16Proof(fixture.circuitInput, artifacts.provingArtifacts);
      if (!await verifyGroth16ProofLocal(
        artifacts.verificationKey,
        generated.proof,
        generated.publicSignals,
      )) throw new Error("The browser-generated proof failed local verification.");
      setLocalChecked(true);
      const seconds = ((performance.now() - startedAt) / 1000).toFixed(2);
      log(`Browser proving check passed in ${seconds}s. The private witness stayed on this device.`, "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Browser proof check failed.";
      setError(message);
      log(message, "error");
    } finally {
      setBusy(undefined);
    }
  };

  const proveAndConsume = async () => {
    if (!artifacts || !walletApi || !account || !addresses.consumer) return;
    setBusy("Proving privately in this browser");
    setError(undefined);
    try {
      const fixture = createRecallActionInput({
        actor: account.address,
        consumer: addresses.consumer,
        ownerSecret: ownerSecret.current,
      });
      const generated = await generateGroth16Proof(fixture.circuitInput, artifacts.provingArtifacts);
      if (!await verifyGroth16ProofLocal(
        artifacts.verificationKey,
        generated.proof,
        generated.publicSignals,
      )) throw new Error("The browser-generated proof failed local verification.");
      const envelope = decodeProofActionEnvelope(generated.publicSignals);
      assertProofActionEnvelope(envelope, {
        chainId: fixture.publicConfig.chainId,
        consumer: addresses.consumer,
        actionId: fixture.publicConfig.actionId,
        policyVersion: fixture.publicConfig.policyVersion,
        actor: account.address,
        policyHash: fixture.publicConfig.policyHash,
        now: Math.floor(Date.now() / 1000),
      });
      log("Private witness proved locally. No witness was uploaded.", "success");

      setBusy("Submitting the proof-bound action");
      const prepared = await prepareGroth16ProofForStarknet(
        artifacts.verificationKey,
        generated.proof,
        generated.publicSignals,
      );
      const call = buildProofActionConsumerCall(addresses.consumer, prepared);
      const response = transactionResponse(await walletApi.request({
        type: "wallet_addInvokeTransaction",
        params: {
          calls: [{
            contract_address: call.contractAddress,
            entry_point: call.entrypoint,
            calldata: CallData.compile(call.calldata ?? []),
          }],
        },
      }));
      await confirmTransaction("Proof-bound recall claim", response.transaction_hash);
      await refreshBalance();
      const claim = await provider.callContract({
        contractAddress: addresses.consumer,
        entrypoint: "get_claim",
        calldata: [account.address],
      });
      if (BigInt(claim[0] ?? 0) !== 1n || BigInt(claim[1] ?? 0) !== fixture.publicConfig.claimTier) {
        throw new Error("The accepted transaction did not record the expected claim tier.");
      }
      const spent = await provider.callContract({
        contractAddress: addresses.consumer,
        entrypoint: "is_nullifier_spent",
        calldata: u256(envelope.nullifier).map(String),
      });
      if (BigInt(spent[0] ?? 0) !== 1n) {
        throw new Error("The accepted transaction did not mark the proof nullifier as spent.");
      }
      setConsumed(true);
      log("Sepolia recorded claim tier 2 and marked the nullifier spent.", "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Proof action failed.";
      setError(message);
      log(message, "error");
    } finally {
      setBusy(undefined);
    }
  };

  const funded = strkBalance !== undefined && strkBalance > 0n;
  const primary = !artifacts
    ? null
    : !account
      ? null
      : !isSepolia
        ? { label: "Switch the wallet to Starknet Sepolia", action: undefined }
        : strkBalance === undefined
          ? null
          : !funded
            ? { label: "Fund this wallet with Sepolia STRK", action: undefined }
            : !classesReady
              ? { label: "Declare three action classes", action: declareStack }
              : !stackReady
                ? { label: "Deploy the action stack", action: deployStack }
                : !registered
                  ? { label: "Register the verifier policy", action: registerVerifier }
                  : !consumed
                    ? { label: "Prove and consume the recall claim", action: proveAndConsume }
                    : null;
  const currentStep = !artifacts
    ? 0
    : !account || !isSepolia || !funded
      ? 1
      : !classesReady
        ? 2
        : !stackReady
          ? 3
          : !registered
            ? 4
            : 5;

  return (
    <main className="shell launch-shell">
      <header className="topbar launch-topbar">
        <a className="wordmark" href="/" aria-label="Back to StarkCircom deployer">
          <span className="wordmark-mark" aria-hidden="true">SC</span>
          <span>StarkCircom</span>
        </a>
        <div className="launch-context" aria-label="Deployment context">
          <span>Recall action</span>
          <span className="context-divider" />
          <span className="context-network"><Network size={13} /> Sepolia</span>
        </div>
      </header>

      <div className="launch-workspace">
        <section className="launch-intro">
          <div>
            <h1>Take a private claim from local proof to Sepolia state.</h1>
          </div>
          <p className="lede">
            One controlled runbook for reproducible artifacts, wallet-approved contracts, policy registration, and a replay-safe recall claim.
          </p>
        </section>

        <div className="launch-layout">
          <section className="runbook" aria-labelledby="runbook-title">
            <div className="runbook-head">
              <div>
                <h2 id="runbook-title">Sepolia launch sequence</h2>
              </div>
              <span className={`status-badge ${error ? "status-error" : busy ? "status-working" : "status-ready"}`}>
                {busy ? <LoaderCircle className="spin" size={13} /> : error ? <CircleAlert size={13} /> : <CircleDot size={13} />}
                {busy ? "In progress" : error ? "Needs attention" : consumed ? "Complete" : "Ready"}
              </span>
            </div>

            <div className="runbook-list">
              <RunbookStep
                number="01"
                title="Verify the build inputs"
                detail={artifacts ? "Manifest, Sierra, CASM, and class hashes match" : "Checking local manifests and compiled outputs"}
                state={artifacts ? "done" : "active"}
                meta={artifacts ? "12 signals · 8,508 constraints" : busy ?? "Loading artifacts"}
              />
              <RunbookStep
                number="02"
                title="Connect the deployment authority"
                detail={!account ? "Argent or Braavos must approve every write" : !isSepolia ? "Wallet is connected to the wrong network" : funded ? "Fee token detected; the wallet checks each exact fee" : "Sepolia STRK is required for fees"}
                state={currentStep > 1 ? "done" : currentStep === 1 ? "active" : "waiting"}
                meta={account ? `${short(account.address)} · ${isSepolia ? formatStrk(strkBalance) : "Wrong network"}` : "Not connected"}
              />
              <RunbookStep
                number="03"
                title="Declare reviewed classes"
                detail="Groth16 verifier, replay-safe consumer, and verifier registry"
                state={classesReady ? "done" : currentStep === 2 ? "active" : "waiting"}
                meta={classesReady ? "3 of 3 declared" : `${Object.values(declared).filter(Boolean).length} of 3 declared`}
              />
              <RunbookStep
                number="04"
                title="Deploy and bind the policy"
                detail="Create unique contracts, then register the verifier commitment"
                state={registered ? "done" : currentStep === 3 || currentStep === 4 ? "active" : "waiting"}
                meta={registered ? "Policy active" : stackReady ? "Contracts deployed · registration next" : "Waiting for declarations"}
              />
              <RunbookStep
                number="05"
                title="Prove and consume once"
                detail="Generate locally, verify locally, submit proof, and read claim state"
                state={consumed ? "done" : currentStep === 5 ? "active" : "waiting"}
                meta={consumed ? "Claim tier 2 recorded" : "Witness remains on this device"}
                last
              />
            </div>

            <div className="operation-dock">
              <div className="operation-copy">
                <span className="operation-kicker">Next approved operation</span>
                <strong>{busy ?? primary?.label ?? (consumed ? "Launch evidence is complete" : "Connect a wallet to continue")}</strong>
                <span>
                  {busy
                    ? "Keep this page open while Sepolia confirms the transaction."
                    : "The app prepares each request. Your wallet remains the only signing authority."}
                </span>
              </div>
              {!account ? (
                <WalletConnectModal />
              ) : primary?.action ? (
                <button className="primary-button operation-button" type="button" disabled={Boolean(busy)} onClick={() => void primary.action?.()}>
                  {busy ? <LoaderCircle className="spin" size={17} /> : <Zap size={17} />}
                  {busy ? "Waiting" : "Continue"}
                </button>
              ) : !isSepolia ? (
                <span className="operation-blocked"><Network size={16} /> Switch network in your wallet</span>
              ) : !funded ? (
                <a className="primary-button operation-button" href={SEPOLIA_FAUCET} target="_blank" rel="noreferrer">
                  Open Sepolia faucet <ArrowUpRight size={16} />
                </a>
              ) : consumed ? (
                <span className="operation-complete"><Check size={16} /> Verified on Sepolia</span>
              ) : null}
            </div>

            {error ? (
              <div className="error-panel launch-error" role="alert">
                <CircleAlert size={18} />
                <div><strong>Operation stopped</strong><p>{error}</p></div>
                <button type="button" className="text-button" onClick={() => { setError(undefined); void load(); }}>Retry checks</button>
              </div>
            ) : null}
          </section>

          <aside className="evidence-rail" aria-label="Launch evidence">
            <section className="rail-section authority-section">
              <div className="rail-heading"><span>Deployment authority</span><WalletCards size={15} /></div>
              <div className="authority-row">
                <div className={`authority-mark ${account && isSepolia ? "authority-online" : ""}`}><LockKeyhole size={16} /></div>
                <div><strong>{account ? short(account.address) : "No wallet connected"}</strong><span>{account ? isSepolia ? "Argent or Braavos · Sepolia" : "Wrong network" : "No write access granted"}</span></div>
              </div>
              {account ? (
                <div className="authority-actions">
                  <button type="button" className="quiet-button" onClick={() => void refreshBalance()}><RefreshCw size={14} /> Refresh</button>
                  <button type="button" className="quiet-button" onClick={() => void disconnect()}><Unplug size={14} /> Disconnect</button>
                </div>
              ) : null}
              {account && isSepolia ? (
                <div className={`balance-strip ${strkBalance === 0n ? "balance-empty" : ""}`}>
                  <span>Fee balance</span><strong>{formatStrk(strkBalance)}</strong>
                </div>
              ) : null}
              {account && isSepolia ? (
                <a className="faucet-link" href={SEPOLIA_FAUCET} target="_blank" rel="noreferrer">
                  {strkBalance === 0n ? "Get" : "Add"} Sepolia STRK <ExternalLink size={13} />
                </a>
              ) : null}
            </section>

            <section className="rail-section">
              <div className="rail-heading"><span>Local proof boundary</span><ShieldCheck size={15} /></div>
              <p className="rail-copy">The ownership secret and witness are generated in this browser. Only the proof and its public signals reach Sepolia.</p>
              <button className="proof-check-button" type="button" disabled={!artifacts || Boolean(busy)} onClick={() => void runLocalProofCheck()}>
                {localChecked ? <Check size={15} /> : <FileCheck2 size={15} />}
                {localChecked ? "Local proof check passed" : "Run proof check"}
              </button>
            </section>

            <section className="rail-section">
              <div className="rail-heading"><span>Deployed addresses</span><span className="rail-count">{Object.values(addresses).filter(Boolean).length}/3</span></div>
              <AddressRow label="Verifier" value={addresses.verifier} />
              <AddressRow label="Registry" value={addresses.registry} />
              <AddressRow label="Consumer" value={addresses.consumer} />
            </section>

            <section className="rail-section evidence-section">
              <div className="rail-heading"><span>Confirmed writes</span><span className="rail-count">{transactions.length}</span></div>
              {transactions.length ? (
                <div className="transaction-list">
                  {transactions.map((transaction) => (
                    <a key={transaction.id} href={`${SEPOLIA_EXPLORER}/tx/${transaction.transactionHash}`} target="_blank" rel="noreferrer" className="transaction-row">
                      <span><Check size={12} />{transaction.stage}</span>
                      <code>{short(transaction.transactionHash)}</code>
                      <ArrowUpRight size={13} />
                    </a>
                  ))}
                  <button
                    type="button"
                    className="evidence-copy-button"
                    onClick={() => void copyText(JSON.stringify({
                      network: "Starknet Sepolia",
                      account: account?.address,
                      addresses,
                      registered,
                      consumed,
                      transactions,
                    }, null, 2))}
                  >
                    <Copy size={13} /> Copy launch evidence
                  </button>
                </div>
              ) : <p className="rail-empty">Confirmed transaction hashes will appear here.</p>}
            </section>
          </aside>
        </div>

        <section className="activity launch-activity">
          <div className="section-heading"><span>Execution log</span><span className="section-meta">{logs.length} events</span></div>
          <div className="log" role="log" aria-live="polite">
            {logs.length ? logs.map((entry) => (
              <div className={`log-row log-${entry.tone}`} key={entry.id}>
                <span className="log-dot" />
                <span>{entry.message}</span>
                {entry.transactionHash ? <a href={`${SEPOLIA_EXPLORER}/tx/${entry.transactionHash}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={12} /></a> : null}
              </div>
            )) : <div className="empty-log">Artifact checks and wallet receipts will appear here.</div>}
          </div>
        </section>

        <div className="scope-warning">
          <CircleAlert size={15} />
          <p><strong>Technical demonstration only.</strong> Manufacturer roots and affected-batch data are synthetic. No authenticated publisher or omission-recovery process is connected.</p>
        </div>
      </div>
    </main>
  );
}

function RunbookStep({
  number,
  title,
  detail,
  meta,
  state,
  last = false,
}: {
  number: string;
  title: string;
  detail: string;
  meta: string;
  state: "done" | "active" | "waiting";
  last?: boolean;
}) {
  return (
    <div className={`runbook-step step-${state} ${last ? "step-last" : ""}`}>
      <div className="step-track">
        <span className="step-node">{state === "done" ? <Check size={14} /> : number}</span>
      </div>
      <div className="step-body">
        <div><strong>{title}</strong><p>{detail}</p></div>
        <span className="step-meta">{meta}</span>
      </div>
    </div>
  );
}

function AddressRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="address-row">
      <span>{label}</span>
      {value ? (
        <div>
          <a href={`${SEPOLIA_EXPLORER}/contract/${value}`} target="_blank" rel="noreferrer"><code>{short(value)}</code></a>
          <button type="button" onClick={() => void copyText(value)} aria-label={`Copy ${label} address`}><Copy size={13} /></button>
        </div>
      ) : <em>Not deployed</em>}
    </div>
  );
}
