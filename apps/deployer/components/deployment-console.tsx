"use client";

import {
  StarknetWalletApi,
  useConnect,
  WalletConnectModal,
} from "@starknet-io/get-starknet-ui";
import {
  Check,
  CircleAlert,
  CircleDashed,
  CircleDot,
  Copy,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Network,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type StarknetPreparedProof,
  type VerifierBuildManifest,
  verifyGroth16ProofReadOnly,
} from "@starkcircom/sdk";
import {
  CallData,
  constants,
  defaultDeployer,
  hash,
  RpcProvider,
  type Abi,
  type CompiledSierra,
  type CompiledSierraCasm,
  type InvokeTransactionReceiptResponse,
} from "starknet";

const SEPOLIA_RPC = "https://starknet-sepolia-rpc.publicnode.com";

type ArtifactBundle = {
  manifest: VerifierBuildManifest;
  sierra: CompiledSierra;
  casm: CompiledSierraCasm;
  abi: Abi;
};

type TransactionResponse = {
  transaction_hash: string;
  class_hash?: string;
};

type Stage =
  | "loading-artifacts"
  | "ready"
  | "declaring"
  | "deploying"
  | "verifying"
  | "error";

type LogEntry = {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
};

function asTransactionResponse(value: unknown): TransactionResponse {
  if (!value || typeof value !== "object" || !("transaction_hash" in value)) {
    throw new Error("The wallet returned an unexpected transaction response.");
  }
  const response = value as Record<string, unknown>;
  if (typeof response.transaction_hash !== "string") {
    throw new Error("The wallet response did not include a transaction hash.");
  }
  return {
    transaction_hash: response.transaction_hash,
    ...(typeof response.class_hash === "string" ? { class_hash: response.class_hash } : {}),
  };
}

function shortHex(value: string, left = 8, right = 6): string {
  return value.length <= left + right + 3
    ? value
    : `${value.slice(0, left + 2)}…${value.slice(-right)}`;
}

function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
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

export function DeploymentConsole() {
  const { connected, disconnect } = useConnect();
  const account = connected?.accounts[0];
  const walletApi = connected?.features[StarknetWalletApi];
  const provider = useMemo(() => new RpcProvider({ nodeUrl: SEPOLIA_RPC }), []);

  const [artifacts, setArtifacts] = useState<ArtifactBundle>();
  const [stage, setStage] = useState<Stage>("loading-artifacts");
  const [error, setError] = useState<string>();
  const [chainId, setChainId] = useState<string>();
  const [isDeclared, setIsDeclared] = useState(false);
  const [declareTx, setDeclareTx] = useState<string>();
  const [deployTx, setDeployTx] = useState<string>();
  const [contractAddress, setContractAddress] = useState<string>();
  const [verificationResult, setVerificationResult] = useState<string>();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const didLoadArtifacts = useRef(false);

  const addLog = useCallback((message: string, tone: LogEntry["tone"] = "info") => {
    setLogs((current) => [
      ...current.slice(-19),
      { id: crypto.randomUUID(), message, tone },
    ]);
  }, []);

  const loadArtifacts = useCallback(async () => {
    setStage("loading-artifacts");
    setError(undefined);
    try {
      const response = await fetch("/api/artifacts", { cache: "no-store" });
      const body = (await response.json()) as ArtifactBundle | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "Could not load verifier artifacts.");
      }

      const classHash = hash.computeContractClassHash(body.sierra);
      const compiledClassHash = hash.computeCompiledClassHash(body.casm);
      if (
        classHash !== body.manifest.classHash ||
        compiledClassHash !== body.manifest.compiledClassHash
      ) {
        throw new Error("Client-side class hashes do not match the verifier manifest.");
      }

      let declared = false;
      try {
        await provider.getClassByHash(classHash);
        declared = true;
      } catch (cause) {
        if (!isClassHashNotFound(cause)) throw cause;
      }

      setArtifacts(body);
      setIsDeclared(declared);
      setStage("ready");
      addLog("Verifier artifacts and class hashes checked.", "success");
      addLog(
        declared
          ? "Verifier class is already declared on Sepolia."
          : "Verifier class has not been declared on Sepolia.",
        declared ? "success" : "info",
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not load verifier artifacts.";
      setError(message);
      setStage("error");
      addLog(message, "error");
    }
  }, [addLog, provider]);

  useEffect(() => {
    if (didLoadArtifacts.current) return;
    didLoadArtifacts.current = true;
    void loadArtifacts();
  }, [loadArtifacts]);

  useEffect(() => {
    if (!walletApi) {
      setChainId(undefined);
      return;
    }
    let cancelled = false;
    void walletApi
      .request({ type: "wallet_requestChainId" })
      .then((value) => {
        if (!cancelled) setChainId(String(value));
      })
      .catch(() => {
        if (!cancelled) setChainId(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [walletApi]);

  const isSepolia = chainId === constants.StarknetChainId.SN_SEPOLIA;
  const canTransact = Boolean(artifacts && walletApi && account && isSepolia);

  const declareVerifier = async () => {
    if (!artifacts || !walletApi || !canTransact) return;
    setStage("declaring");
    setError(undefined);
    addLog("Waiting for verifier declaration approval in your wallet.");
    try {
      const response = asTransactionResponse(
        await walletApi.request({
          type: "wallet_addDeclareTransaction",
          params: {
            class_hash: artifacts.manifest.classHash,
            compiled_class_hash: artifacts.manifest.compiledClassHash,
            contract_class: {
              ...artifacts.sierra,
              abi:
                typeof artifacts.sierra.abi === "string"
                  ? artifacts.sierra.abi
                  : JSON.stringify(artifacts.sierra.abi),
            },
          },
        }),
      );
      if (response.class_hash && response.class_hash !== artifacts.manifest.classHash) {
        throw new Error("The wallet returned a different class hash.");
      }
      setDeclareTx(response.transaction_hash);
      addLog("Declaration submitted. Waiting for Sepolia acceptance.");
      const receipt = await provider.waitForTransaction(response.transaction_hash);
      if (!receipt.isSuccess()) throw new Error("The declaration transaction did not succeed.");
      await provider.getClassByHash(artifacts.manifest.classHash);
      setIsDeclared(true);
      setStage("ready");
      addLog("Verifier class declared on Sepolia.", "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Verifier declaration failed.";
      setError(message);
      setStage("error");
      addLog(message, "error");
    }
  };

  const deployVerifier = async () => {
    if (!artifacts || !walletApi || !account || !canTransact || !isDeclared) return;
    setStage("deploying");
    setError(undefined);
    addLog("Waiting for verifier deployment approval in your wallet.");
    try {
      const deployer = defaultDeployer.buildDeployerCall(
        {
          classHash: artifacts.manifest.classHash,
          constructorCalldata: [],
          salt: newSalt(),
          unique: true,
        },
        account.address,
      );
      const calls = deployer.calls.map((call) => ({
        contract_address: call.contractAddress,
        entry_point: call.entrypoint,
        calldata: CallData.compile(call.calldata ?? []),
      }));
      const response = asTransactionResponse(
        await walletApi.request({
          type: "wallet_addInvokeTransaction",
          params: { calls },
        }),
      );
      setDeployTx(response.transaction_hash);
      addLog("Deployment submitted. Waiting for Sepolia acceptance.");
      const receipt = await provider.waitForTransaction(response.transaction_hash);
      if (!receipt.isSuccess()) throw new Error("The deployment transaction did not succeed.");
      const deployment = defaultDeployer.parseDeployerEvent(
        receipt.value as InvokeTransactionReceiptResponse,
      );
      setContractAddress(deployment.contract_address);
      setStage("ready");
      addLog(`Verifier deployed at ${shortHex(deployment.contract_address)}.`, "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Verifier deployment failed.";
      setError(message);
      setStage("error");
      addLog(message, "error");
    }
  };

  const verifySample = async () => {
    if (!contractAddress) return;
    setStage("verifying");
    setError(undefined);
    addLog("Generating the 3 × 11 sample proof locally on this server.");
    try {
      const response = await fetch("/api/sample-proof", { cache: "no-store" });
      const body = (await response.json()) as StarknetPreparedProof | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "Could not generate the sample proof.");
      }
      const result = await verifyGroth16ProofReadOnly(provider, contractAddress, body);
      if (!result.valid) throw new Error(`Verifier rejected the proof with error ${result.error}.`);
      const product = result.publicSignals[0];
      if (product !== 33n) throw new Error(`Verifier returned unexpected public signal ${product}.`);
      setVerificationResult("Valid proof · public product 33");
      setStage("ready");
      addLog("Fresh Starknet RPC verification returned public product 33.", "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Sample verification failed.";
      setError(message);
      setStage("error");
      addLog(message, "error");
    }
  };

  const busy = ["loading-artifacts", "declaring", "deploying", "verifying"].includes(stage);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="wordmark" aria-label="StarkCircom">
          <span className="wordmark-mark" aria-hidden="true">SC</span>
          <span>StarkCircom</span>
        </div>
        <div className="topbar-actions">
          <a className="action-link" href="/actions">Proof actions</a>
          <div className="network-pill">
            <Network size={14} aria-hidden="true" />
            Starknet Sepolia
          </div>
        </div>
      </header>

      <div className="workspace">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Verifier deployment console</p>
          <h1 id="page-title">Take one reviewed verifier on-chain.</h1>
          <p className="lede">
            The source, Sierra, CASM, and class hashes are checked before your wallet receives a request.
            Your wallet remains the final authority.
          </p>
        </section>

        <div className="workgrid">
          <aside className="pipeline" aria-label="Deployment progress">
            <div className="section-heading">
              <span>Pipeline</span>
              <span className="section-meta">BN254 · Groth16</span>
            </div>
            <ol className="steps">
              <Step
                label="Artifacts checked"
                detail={artifacts ? shortHex(artifacts.manifest.classHash) : "Reading local build"}
                state={artifacts ? "done" : stage === "error" ? "error" : "active"}
              />
              <Step
                label="Wallet connected"
                detail={account ? shortHex(account.address) : "Argent or Braavos"}
                state={account ? "done" : "idle"}
              />
              <Step
                label="Class declared"
                detail={isDeclared ? "Available on Sepolia" : "Wallet approval required"}
                state={isDeclared ? "done" : stage === "declaring" ? "active" : "idle"}
              />
              <Step
                label="Contract deployed"
                detail={contractAddress ? shortHex(contractAddress) : "Unique UDC deployment"}
                state={contractAddress ? "done" : stage === "deploying" ? "active" : "idle"}
              />
              <Step
                label="Proof verified"
                detail={verificationResult ?? "Fresh read-only Starknet call"}
                state={verificationResult ? "done" : stage === "verifying" ? "active" : "idle"}
                last
              />
            </ol>
          </aside>

          <section className="console-card" aria-labelledby="action-title">
            <div className="console-head">
              <div>
                <p className="eyebrow">Current action</p>
                <h2 id="action-title">{currentActionTitle({ artifacts, account, isSepolia, isDeclared, contractAddress, verificationResult })}</h2>
              </div>
              <StatusBadge stage={stage} />
            </div>

            {stage === "loading-artifacts" ? (
              <ArtifactSkeleton />
            ) : artifacts ? (
              <div className="artifact-summary">
                <SummaryRow label="Class hash" value={artifacts.manifest.classHash} />
                <SummaryRow label="Compiled hash" value={artifacts.manifest.compiledClassHash} />
                <SummaryRow label="Garaga" value={`${artifacts.manifest.toolchain.garaga} · ${artifacts.manifest.toolchain.garagaCommit.slice(0, 8)}`} />
                <SummaryRow label="Scarb" value="2.16.1" />
              </div>
            ) : null}

            {error ? (
              <div className="error-panel" role="alert">
                <CircleAlert size={18} aria-hidden="true" />
                <div>
                  <strong>Action stopped</strong>
                  <p>{error}</p>
                </div>
                {!artifacts ? (
                  <button className="text-button" type="button" onClick={() => void loadArtifacts()}>
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="wallet-zone">
              <div className="wallet-copy">
                <LockKeyhole size={18} aria-hidden="true" />
                <div>
                  <strong>{account ? shortHex(account.address, 10, 8) : "Wallet not connected"}</strong>
                  <span>
                    {account
                      ? isSepolia
                        ? "Connected to Sepolia"
                        : "Switch this wallet to Starknet Sepolia"
                      : "No private key is read or stored by this app"}
                  </span>
                </div>
              </div>
              <div className="wallet-actions">
                <WalletConnectModal />
                {connected ? (
                  <button className="icon-button" type="button" onClick={() => void disconnect()} aria-label="Disconnect wallet">
                    <Unplug size={17} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="primary-actions">
              {!isDeclared ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void declareVerifier()}
                  disabled={!canTransact || busy}
                  aria-busy={stage === "declaring"}
                >
                  {stage === "declaring" ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
                  {stage === "declaring" ? "Declaring verifier" : "Review and declare verifier"}
                </button>
              ) : !contractAddress ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void deployVerifier()}
                  disabled={!canTransact || busy}
                  aria-busy={stage === "deploying"}
                >
                  {stage === "deploying" ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <CircleDot size={17} aria-hidden="true" />}
                  {stage === "deploying" ? "Deploying contract" : "Review and deploy contract"}
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void verifySample()}
                  disabled={busy || Boolean(verificationResult)}
                  aria-busy={stage === "verifying"}
                >
                  {stage === "verifying" ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
                  {verificationResult ? "Proof verified" : stage === "verifying" ? "Verifying proof" : "Verify sample proof"}
                </button>
              )}
              <p className="action-note">
                Wallet approval is always required. This page cannot sign for you.
              </p>
            </div>

            {(declareTx || deployTx || contractAddress) ? (
              <div className="receipts" aria-label="Deployment receipts">
                {declareTx ? <ReceiptLink label="Declaration" value={declareTx} kind="tx" /> : null}
                {deployTx ? <ReceiptLink label="Deployment" value={deployTx} kind="tx" /> : null}
                {contractAddress ? <ReceiptLink label="Verifier" value={contractAddress} kind="contract" /> : null}
              </div>
            ) : null}
          </section>
        </div>

        <section className="activity" aria-labelledby="activity-title">
          <div className="section-heading">
            <span id="activity-title">Activity</span>
            <span className="section-meta" aria-live="polite">{logs.length} events</span>
          </div>
          <div className="log" role="log" aria-live="polite">
            {logs.length === 0 ? (
              <div className="empty-log">
                <CircleDashed size={18} aria-hidden="true" />
                Build checks will appear here.
              </div>
            ) : logs.map((entry) => (
              <div className={`log-row log-${entry.tone}`} key={entry.id}>
                <span className="log-dot" aria-hidden="true" />
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function currentActionTitle(input: {
  artifacts?: ArtifactBundle;
  account?: { address: string };
  isSepolia: boolean;
  isDeclared: boolean;
  contractAddress?: string;
  verificationResult?: string;
}): string {
  if (!input.artifacts) return "Checking build artifacts";
  if (!input.account) return "Connect a Starknet wallet";
  if (!input.isSepolia) return "Switch your wallet to Sepolia";
  if (!input.isDeclared) return "Declare the verifier class";
  if (!input.contractAddress) return "Deploy the verifier contract";
  if (!input.verificationResult) return "Prove the deployed verifier works";
  return "Verifier is live and checked";
}

function Step({
  label,
  detail,
  state,
  last = false,
}: {
  label: string;
  detail: string;
  state: "idle" | "active" | "done" | "error";
  last?: boolean;
}) {
  return (
    <li className={`step step-${state}`}>
      <div className="step-rail" aria-hidden="true">
        <span className="step-icon">
          {state === "done" ? <Check size={14} /> : state === "active" ? <LoaderCircle className="spin" size={14} /> : state === "error" ? <CircleAlert size={14} /> : <span />}
        </span>
        {!last ? <span className="step-line" /> : null}
      </div>
      <div className="step-copy">
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </li>
  );
}

function StatusBadge({ stage }: { stage: Stage }) {
  const busy = ["loading-artifacts", "declaring", "deploying", "verifying"].includes(stage);
  return (
    <span className={`status-badge status-${stage}`}>
      {busy ? <LoaderCircle className="spin" size={13} aria-hidden="true" /> : stage === "error" ? <CircleAlert size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
      {busy ? "Working" : stage === "error" ? "Needs attention" : "Ready"}
    </span>
  );
}

function ArtifactSkeleton() {
  return (
    <div className="artifact-summary" aria-label="Loading verifier artifacts" aria-busy="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="summary-row" key={index}>
          <span className="skeleton skeleton-label" />
          <span className="skeleton skeleton-value" />
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <code title={value}>{shortHex(value, 12, 10)}</code>
    </div>
  );
}

function ReceiptLink({ label, value, kind }: { label: string; value: string; kind: "tx" | "contract" }) {
  const [copied, setCopied] = useState(false);
  const href = `https://sepolia.voyager.online/${kind}/${value}`;
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <div className="receipt-row">
      <span>{label}</span>
      <code>{shortHex(value, 10, 8)}</code>
      <button className="copy-button" type="button" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      </button>
      <a className="copy-button" href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label.toLowerCase()} in Voyager`}>
        <ExternalLink size={15} aria-hidden="true" />
      </a>
    </div>
  );
}
