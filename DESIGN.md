---
name: StarkCircom
description: A launch-control workbench for private proof actions on Starknet.
colors:
  instrument-canvas: "#f5f6f8"
  instrument-surface: "#ffffff"
  instrument-inset: "#eef0f3"
  graphite: "#13161b"
  steel: "#4b5360"
  muted-steel: "#707987"
  starknet-coral: "#b93424"
  coral-wash: "#fff0ec"
  confirmed-green: "#18794e"
  warning-amber: "#9a6700"
  stopped-red: "#c13731"
  dark-ambient: "rgba(0, 0, 0, 0.26)"
typography:
  display:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "clamp(36px, 4.5vw, 58px)"
    fontWeight: 620
    lineHeight: 0.99
    letterSpacing: "-0.045em"
  legacy-display:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "clamp(34px, 5vw, 54px)"
    fontWeight: 620
    lineHeight: 1.02
  console-title:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "22px"
    fontWeight: 640
    lineHeight: 1.2
  section-title:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "21px"
    fontWeight: 640
    lineHeight: 1.2
  lede:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  title:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.35
  small:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0.075em"
  eyebrow:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1.45
  micro:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "8px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: "4px"
  compact: "6px"
  control: "8px"
  operation: "9px"
  md: "12px"
  dock: "13px"
  panel: "14px"
  lg: "16px"
  workspace: "18px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "28px"
  xl: "48px"
components:
  button-operation:
    backgroundColor: "{colors.starknet-coral}"
    textColor: "{colors.instrument-surface}"
    rounded: "{rounded.control}"
    padding: "0 15px"
    height: "40px"
  panel-workspace:
    backgroundColor: "{colors.instrument-surface}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.workspace}"
  status-active:
    backgroundColor: "{colors.coral-wash}"
    textColor: "{colors.starknet-coral}"
    rounded: "999px"
    padding: "0 10px"
    height: "30px"
---

# Design System: StarkCircom

## Overview

**Creative North Star: "The Proof Launch Console"**

StarkCircom should feel like a precise launch instrument rather than a generic dashboard. The interface exposes one controlled sequence, keeps the next wallet-approved operation obvious, and places evidence beside the operation that created it. Calm cool surfaces make the technical system readable. Starknet coral appears only where attention or action is required.

The system is compact but not cramped. It favors explicit labels, visible states, and structured evidence over decorative graphics. Security boundaries and synthetic-data limits remain visible instead of being hidden in help text.

**Key Characteristics:**
- A single operational runbook as the main spatial spine.
- Adjacent evidence for authority, balances, addresses, and receipts.
- Cool instrument surfaces with sparse coral emphasis.
- Monospace text only for technical labels, hashes, counts, and status details.
- Semantic colors reserved for confirmed, warning, and stopped states.

## Colors

The palette pairs cool neutral instrument surfaces with graphite structure and a rare coral operation color.

### Primary
- **Starknet Coral:** Marks the current step, the next approved operation, and primary transaction controls.
- **Coral Wash:** Supports active operation panels without turning the whole screen into an alert.

### Neutral
- **Instrument Canvas:** The page field behind the launch console.
- **Instrument Surface:** The highest-clarity surface for logs and controls.
- **Instrument Inset:** Recessed logs and secondary data areas.
- **Graphite:** Primary headings and high-priority values.
- **Steel:** Body copy and supporting explanations.
- **Muted Steel:** Metadata, waiting states, and technical labels.

### Named Rules

**The One Live Signal Rule.** Coral identifies the current operation only. Completed steps use green and waiting steps stay neutral.

**The Semantic Reserve Rule.** Green means confirmed, amber means attention, and red means stopped. These colors are not decorative.

## Typography

- **Display Font:** IBM Plex Sans with a sans-serif fallback
- **Body Font:** IBM Plex Sans with a sans-serif fallback
- **Label/Mono Font:** IBM Plex Mono with a monospace fallback

**Character:** IBM Plex Sans gives the interface an engineered but human voice. IBM Plex Mono separates machine evidence from explanatory copy.

### Hierarchy
- **Display:** Tight, heavy, and limited to the page proposition.
- **Headline:** Compact section names with slightly tightened tracking.
- **Title:** Operational step names at medium weight.
- **Body:** Comfortable explanatory copy with short line lengths.
- **Label:** Small uppercase mono text for stage names and evidence categories.

### Named Rules

**The Evidence Type Rule.** Use monospace only when the content is machine-shaped or operational. Explanations stay in the sans-serif face.

## Layout

Desktop uses a centered 1200px work area. The launch console has a fluid runbook and a fixed 350px evidence rail. The page proposition sits above it in an uneven two-column introduction. At 920px the evidence rail moves below the runbook in two columns. At 620px it becomes one column, step metadata moves below step copy, and operation controls become full width.

Spacing follows a compact 6, 10, 16, 28, and 48px rhythm. Dividers establish sequence and data grouping. Cards are not repeated as independent dashboard widgets. Related controls share one continuous workspace.

## Elevation & Depth

The system is flat by default. Borders and tonal layering define most depth. The main launch workspace receives one soft ambient shadow to separate it from the canvas. Buttons use no glow and secondary controls receive only a slight hover lift through border and shadow changes.

### Shadow Vocabulary
- **Workspace Ambient:** A broad, low-opacity shadow under the main launch console only.
- **Control Hover:** A small neutral shadow used on quiet interactive controls.

### Named Rules

**The Flat Evidence Rule.** Evidence rows and status areas use borders and surface shifts, not independent floating shadows.

## Shapes

Controls use restrained 8px corners. Internal panels use 13 to 14px corners. The main workspace uses an 18px outer radius. Status indicators may use full pills because they are compact state labels, not containers. Circular nodes are reserved for sequence position and completion.

## Components

### Buttons
- **Shape:** Compact controls with gently curved 8 to 9px corners.
- **Primary:** Coral background, white text, and a 40px minimum height.
- **Hover / Focus:** Slight brightness change on hover and a visible focus outline outside the control.
- **Secondary:** White or surface background with a neutral border and steel text.

### Chips
- **Style:** Small bordered status pills with an icon and short state label.
- **State:** Active uses coral wash, confirmed uses green wash, and stopped uses red wash.

### Cards / Containers
- **Corner Style:** 14px for support panels and 18px for the main workspace.
- **Background:** White and cool gray layers.
- **Shadow Strategy:** Only the main workspace floats.
- **Border:** One-pixel neutral borders establish hierarchy.
- **Internal Padding:** 16px on narrow screens and 20 to 28px on wider screens.

### Navigation
- **Style:** A short 58px utility bar with product identity on the left and deployment context on the right. It stays visible while the user waits for wallet and network operations.

### Runbook
- **Style:** A vertical sequence with numbered or confirmed circular nodes, connecting rules, concise action copy, and right-aligned machine metadata.
- **Behavior:** Exactly one unfinished step is active. Later steps remain visibly present but quiet.

### Evidence Rail
- **Style:** A cooler recessed surface attached directly to the runbook. It groups deployment authority, local proof boundaries, addresses, and confirmed transaction hashes.

## Do's and Don'ts

### Do:
- **Do** make the next owner-approved operation the strongest control on the screen.
- **Do** place transaction hashes, deployed addresses, and readback evidence near the launch sequence.
- **Do** keep wrong-network, unfunded, pending, rejected, failed, and confirmed states visibly distinct.
- **Do** preserve explicit language about local witnesses and synthetic manufacturer data.

### Don't:
- **Don't** turn each deployment fact into a generic dashboard card.
- **Don't** use coral across completed or passive content.
- **Don't** hide wallet authority or imply that the app signs transactions.
- **Don't** present a deployment as complete without confirmed receipts and state readback.
- **Don't** add decorative gradients, glow effects, or oversized icons.
