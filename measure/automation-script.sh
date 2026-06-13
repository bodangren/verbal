#!/usr/bin/env bash
# measure/automation-script.sh
#
# Automates Measure track completion using a tiered TDD AI pipeline:
#   Sr dev (per track)       -- writes test-strategy.md
#   Mid dev (per phase)      -- writes failing tests (Red)
#   Jr dev (per phase)       -- implements to pass tests (Green)
#   Review agent (per track) -- final review + tech-debt clearance
#
# Usage:
#   chmod +x measure/automation-script.sh
#   ./measure/automation-script.sh              # all incomplete tracks/phases
#   ./measure/automation-script.sh --start 2    # start from 2nd incomplete phase
#   ./measure/automation-script.sh --dry-run    # preview without executing
#   ./measure/automation-script.sh --track perf # filter tracks by regex
#   ./measure/automation-script.sh --skip-strategy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- AI Runner Configuration ---------------------------------------------
# OpenCode-backed roles attach to one shared server. The script checks the
# server URL and starts it when it is not already running.
#
# *_RUNNER overrides remain supported for non-OpenCode commands. Defaults use
# OPENCODE_SERVER_URL with the role models below.
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
OPENCODE_SERVER_HOSTNAME="${OPENCODE_SERVER_HOSTNAME:-127.0.0.1}"
OPENCODE_SERVER_PORT="${OPENCODE_SERVER_PORT:-4096}"
OPENCODE_SERVER_URL="${OPENCODE_SERVER_URL:-http://localhost:$OPENCODE_SERVER_PORT}"
OPENCODE_SERVER_AUTOSTART="${OPENCODE_SERVER_AUTOSTART:-true}"
OPENCODE_SERVER_LOG="${OPENCODE_SERVER_LOG:-$REPO_ROOT/measure/opencode-server.log}"
OPENCODE_SERVER_PID_FILE="${OPENCODE_SERVER_PID_FILE:-$REPO_ROOT/measure/opencode-server.pid}"
OPENCODE_SERVER_START_TIMEOUT="${OPENCODE_SERVER_START_TIMEOUT:-30}"

SR_MODEL="${SR_MODEL:-vocengine-coding/glm-5.1}"
MID_MODEL="${MID_MODEL:-minimax-cn-coding-plan/MiniMax-M3}"
JR_MODEL="${JR_MODEL:-xiaomi/mimo-v2.5-pro}"
REVIEW_MODEL="${REVIEW_MODEL:-kimi-for-coding/k2p7}"

SR_AGENT="${SR_AGENT:-}"
MID_AGENT="${MID_AGENT:-}"
JR_AGENT="${JR_AGENT:-}"
REVIEW_AGENT="${REVIEW_AGENT:-}"

SR_RUNNER="${SR_RUNNER:-}"
MID_RUNNER="${MID_RUNNER:-}"
JR_RUNNER="${JR_RUNNER:-}"
REVIEW_RUNNER="${REVIEW_RUNNER:-}"

# --- Project-specific defaults -------------------------------------------
# Override these in the environment for repos with different commands.
PROJECT_PATHS="${PROJECT_PATHS:-.}"
PROJECT_TESTS="${PROJECT_TESTS:-npm test}"
PROJECT_CHECKS="${PROJECT_CHECKS:-npm run build}"
PROJECT_LINT="${PROJECT_LINT:-npm run lint}"
PROJECT_DEV_URL="${PROJECT_DEV_URL:-}"

# --- Parse arguments -----------------------------------------------------
START_PHASE=1
DRY_RUN=false
TRACK_FILTER=""
SKIP_STRATEGY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --start)
      START_PHASE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --track)
      TRACK_FILTER="$2"
      shift 2
      ;;
    --skip-strategy)
      SKIP_STRATEGY=true
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: $0 [OPTIONS]

Automates Measure track completion with a TDD agent pipeline.

Options:
  --start N         Start from the Nth incomplete phase (1-based)
  --dry-run         Preview the plan without executing
  --track REGEX     Only process tracks matching the regex
  --skip-strategy   Skip Sr dev test-strategy generation (assume it exists)
  -h, --help        Show this help message

Environment variables:
  OPENCODE_BIN                   OpenCode executable (default: opencode)
  OPENCODE_SERVER_HOSTNAME       Server bind host (default: 127.0.0.1)
  OPENCODE_SERVER_PORT           Server port (default: 4096)
  OPENCODE_SERVER_URL            Shared server URL (default: http://localhost:$OPENCODE_SERVER_PORT)
  OPENCODE_SERVER_AUTOSTART      Start server when down (default: true)
  OPENCODE_SERVER_LOG            Server log path
  OPENCODE_SERVER_PID_FILE       Server PID file path
  SR_MODEL                       Senior strategy model
  MID_MODEL                      Mid-level test-writing model
  JR_MODEL                       Junior implementation model
  REVIEW_MODEL                   Dedicated review model
  SR_AGENT                       Optional OpenCode agent for strategy
  MID_AGENT                      Optional OpenCode agent for test-writing
  JR_AGENT                       Optional OpenCode agent for implementation
  REVIEW_AGENT                   Optional OpenCode agent for final review
  SR_RUNNER                      Full command prefix override for senior strategy
  MID_RUNNER                     Full command prefix override for mid test-writing
  JR_RUNNER                      Full command prefix override for junior implementation
  REVIEW_RUNNER                  Full command prefix override for final review
  PROJECT_PATHS                  Source paths agents should focus on
  PROJECT_TESTS                  Test command for closeout review
  PROJECT_CHECKS                 Build/typecheck command for closeout review
  PROJECT_LINT                   Lint command for closeout review
  PROJECT_DEV_URL                Optional URL for visual verification
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# --- Shared OpenCode server helpers -------------------------------------
opencode_server_reachable() {
  if command -v curl >/dev/null 2>&1; then
    local status
    status="$(curl -s -o /dev/null -w '%{http_code}' "$OPENCODE_SERVER_URL" || true)"
    [[ "$status" != "000" ]]
    return
  fi

  # If curl is unavailable, let opencode run surface connection errors.
  return 0
}

start_opencode_server() {
  echo ">>> Starting shared OpenCode server at $OPENCODE_SERVER_URL"
  mkdir -p "$(dirname "$OPENCODE_SERVER_LOG")" "$(dirname "$OPENCODE_SERVER_PID_FILE")"
  "$OPENCODE_BIN" serve --hostname "$OPENCODE_SERVER_HOSTNAME" --port "$OPENCODE_SERVER_PORT" >"$OPENCODE_SERVER_LOG" 2>&1 &
  echo $! >"$OPENCODE_SERVER_PID_FILE"
}

ensure_opencode_server() {
  if opencode_server_reachable; then
    echo ">>> Reusing shared OpenCode server at $OPENCODE_SERVER_URL"
    return 0
  fi

  if [[ "$OPENCODE_SERVER_AUTOSTART" != true ]]; then
    cat <<EOF
ERROR: No OpenCode server is reachable at $OPENCODE_SERVER_URL.

Start one shared server first:
  $OPENCODE_BIN serve --hostname $OPENCODE_SERVER_HOSTNAME --port $OPENCODE_SERVER_PORT

Or set OPENCODE_SERVER_AUTOSTART=true so this script can start it.
EOF
    exit 1
  fi

  start_opencode_server

  local waited=0
  while [[ $waited -lt $OPENCODE_SERVER_START_TIMEOUT ]]; do
    if opencode_server_reachable; then
      echo ">>> Shared OpenCode server is ready at $OPENCODE_SERVER_URL"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  cat <<EOF
ERROR: OpenCode server did not become reachable at $OPENCODE_SERVER_URL within $OPENCODE_SERVER_START_TIMEOUT seconds.
Log: $OPENCODE_SERVER_LOG
EOF
  exit 1
}

run_opencode_role() {
  local model="$1"
  local agent="$2"
  local prompt="$3"
  local cmd=("$OPENCODE_BIN" run --attach "$OPENCODE_SERVER_URL" --dir "$REPO_ROOT" -m "$model")

  if [[ -n "$agent" ]]; then
    cmd+=(--agent "$agent")
  fi

  cmd+=("$prompt")
  "${cmd[@]}"
}

run_role() {
  local runner="$1"
  local model="$2"
  local agent="$3"
  local prompt="$4"

  if [[ -n "$runner" ]]; then
    $runner "$prompt"
  else
    run_opencode_role "$model" "$agent" "$prompt"
  fi
}

if [[ "$DRY_RUN" == false ]]; then
  ensure_opencode_server
fi

# --- Auto-discover tracks ------------------------------------------------
mapfile -t ALL_TRACKS < <(
  for dir in "$REPO_ROOT/measure/tracks"/*/; do
    [ -d "$dir" ] || continue
    basename "$dir"
  done | sort
)

TRACKS=()
for t in "${ALL_TRACKS[@]}"; do
  if [[ -n "$TRACK_FILTER" && ! "$t" =~ $TRACK_FILTER ]]; then
    continue
  fi
  TRACKS+=("$t")
done

if [[ ${#TRACKS[@]} -eq 0 ]]; then
  echo "No tracks found matching filter: $TRACK_FILTER"
  exit 0
fi

# --- Discover incomplete phases using Python -----------------------------
# Groups phases by track. Skips deferred tasks (any task line containing
# "deferred" is treated as intentionally excluded).
TRACKS_CSV="$(IFS=,; echo "${TRACKS[*]}")"
PHASE_DATA="$(python3 -c "
import re, os, sys

tracks = sys.argv[1].split(',')
repo = sys.argv[2]

for tid in tracks:
    plan_path = os.path.join(repo, 'measure', 'tracks', tid, 'plan.md')
    if not os.path.isfile(plan_path):
        continue
    text = open(plan_path).read()
    phases = re.split(r'(?=^## Phase )', text, flags=re.MULTILINE)
    for phase in phases:
        heading_match = re.match(r'^## (Phase .+)', phase, re.MULTILINE)
        if not heading_match:
            continue
        heading_line = heading_match.group(0)
        all_tasks = re.findall(r'^- \[([ ~x])\] (.+)', phase, re.MULTILINE)
        incomplete = 0
        for status, task_text in all_tasks:
            if status != 'x' and 'deferred' not in task_text.lower():
                incomplete += 1
        total = len(all_tasks)
        if incomplete > 0:
            display = re.sub(r'^## ', '', heading_line)
            display = re.sub(r' *\[(checkpoint|final-verification):[^\]]*\]', '', display)
            print(f'{tid}|{display}|{incomplete}|{total}')
" "$TRACKS_CSV" "$REPO_ROOT")"

if [[ -z "$PHASE_DATA" ]]; then
  echo ""
  echo "All phases are already complete! Nothing to run."
  exit 0
fi

# --- Build arrays from Python output -------------------------------------
declare -a PHASE_TRACK=()
declare -a PHASE_HEADING=()
declare -a PHASE_INCOMPLETE=()
declare -a PHASE_TOTAL=()

while IFS='|' read -r tid heading incomplete total; do
  PHASE_TRACK+=("$tid")
  PHASE_HEADING+=("$heading")
  PHASE_INCOMPLETE+=("$incomplete")
  PHASE_TOTAL+=("$total")
done <<< "$PHASE_DATA"

TOTAL_PHASES=${#PHASE_TRACK[@]}

# --- Validate --start argument -------------------------------------------
if [[ $START_PHASE -lt 1 ]] || [[ $START_PHASE -gt $TOTAL_PHASES ]]; then
  echo "ERROR: --start must be between 1 and $TOTAL_PHASES"
  exit 1
fi

# --- Print header --------------------------------------------------------
echo ""
echo "+--------------------------------------------------------------+"
echo "|   Measure -- Automated TDD Production Pipeline              |"
echo "+--------------------------------------------------------------+"
echo ""
echo "Repository: $REPO_ROOT"
echo "OpenCode:   $OPENCODE_SERVER_URL"
echo "Models:     SR=$SR_MODEL | MID=$MID_MODEL | JR=$JR_MODEL | REVIEW=$REVIEW_MODEL"
echo "Tracks selected: ${#TRACKS[@]}"
echo "Incomplete phases found: $TOTAL_PHASES (completed phases are skipped)"
echo ""

for i in $(seq 0 $((TOTAL_PHASES - 1))); do
  num=$((i + 1))
  if [[ $num -lt $START_PHASE ]]; then
    echo "  [$num] ${PHASE_TRACK[$i]} -- ${PHASE_HEADING[$i]}  (${PHASE_INCOMPLETE[$i]}/${PHASE_TOTAL[$i]} remaining)  (skipped)"
  else
    echo "  [$num] ${PHASE_TRACK[$i]} -- ${PHASE_HEADING[$i]}  (${PHASE_INCOMPLETE[$i]}/${PHASE_TOTAL[$i]} remaining)"
  fi
done

echo ""

if [[ $DRY_RUN == true ]]; then
  echo "DRY RUN -- no commands will be executed."
  echo "Would start from phase $START_PHASE."
  exit 0
fi

# --- Helper: check if a track has more phases later in the list ---------
has_more_phases() {
  local current_idx="$1"
  local track_id="$2"
  local j
  for ((j = current_idx + 1; j < TOTAL_PHASES; j++)); do
    if [[ "${PHASE_TRACK[$j]}" == "$track_id" ]]; then
      return 0
    fi
  done
  return 1
}

# --- Main production loop ------------------------------------------------
declare -A TRACK_STRATEGY_CHECKED

for i in $(seq "$START_PHASE" "$TOTAL_PHASES"); do
  idx=$((i - 1))
  track_id="${PHASE_TRACK[$idx]}"
  phase_heading="${PHASE_HEADING[$idx]}"
  plan_file="measure/tracks/$track_id/plan.md"
  strategy_file="measure/tracks/$track_id/test-strategy.md"

  echo "=============================================================="
  echo "  Phase $i of $TOTAL_PHASES: $phase_heading"
  echo "  Track:  $track_id"
  echo "  Plan:   $plan_file"
  echo "  Tasks:  ${PHASE_INCOMPLETE[$idx]}/${PHASE_TOTAL[$idx]} remaining"
  echo "=============================================================="
  echo ""

  if [[ "$SKIP_STRATEGY" == false && -z "${TRACK_STRATEGY_CHECKED[$track_id]:-}" ]]; then
    if [[ ! -f "$REPO_ROOT/$strategy_file" ]]; then
      echo ">>> [Track Setup] Sr dev writing test-strategy.md for $track_id"
      echo ""

      STRATEGY_PROMPT="Load the measure skill and the build-graph skill. Read measure/index.md, $plan_file, and measure/tracks/$track_id/spec.md if it exists. Use build-graph to understand the project before planning tests: check whether graph.db exists and is fresh; run build-graph stats ./graph.db when available, or build-graph scan ./ ./graph.db when the graph is missing or stale and the project is TypeScript. Use build-graph search/inspect/callers for symbols related to this track. You are the Tech Lead for this track. Write a concise test-strategy.md in the same directory with: (1) testing pyramid guidance per phase (unit vs integration vs e2e), (2) shared test fixtures or mocks needed across phases, (3) cross-phase edge cases and dependencies, (4) architecture guardrails -- existing patterns to reuse and anti-patterns to avoid, (5) brief per-phase test approach notes, and (6) build-graph findings that shaped the strategy. Keep it under 120 lines. Do NOT write implementation code. Do NOT modify existing source files."

      if ! run_role "$SR_RUNNER" "$SR_MODEL" "$SR_AGENT" "$STRATEGY_PROMPT"; then
        echo "ERROR: Sr dev failed to write test strategy for $track_id"
        exit 1
      fi
      echo ""
      echo ">>> Track strategy complete for $track_id"
      echo ""
    else
      echo ">>> Using existing test-strategy.md for $track_id"
    fi
    TRACK_STRATEGY_CHECKED["$track_id"]=1
  fi

  echo ">>> [Step 1/2] Mid dev writing tests for: $phase_heading"
  echo ""

  STEP1_PROMPT="Load the measure skill and the build-graph skill. Read measure/index.md, $strategy_file, and $plan_file. Focus on the current phase: $phase_heading. Use build-graph before writing tests: run build-graph stats ./graph.db when available, and use build-graph search/inspect/callers on symbols, files, routes, components, or schemas related to this phase. If graph.db is missing or stale and the project is TypeScript, run build-graph scan ./ ./graph.db first. You are writing failing tests (Red phase) for the next uncompleted tasks in this phase. Follow the test strategy. Work in the project codebase paths: $PROJECT_PATHS. Write tests first. Mark tasks as [~] in plan.md as you start them. Do NOT implement feature logic. Do NOT modify existing source code except test files and Measure docs. Commit tests with a descriptive Conventional Commit message. If the test strategy is unclear or contradicts existing patterns, add a brief note to measure/tech-debt.md."

  if ! run_role "$MID_RUNNER" "$MID_MODEL" "$MID_AGENT" "$STEP1_PROMPT"; then
    echo "ERROR: Mid dev failed for phase $phase_heading"
    exit 1
  fi

  echo ""
  echo ">>> Step 1 complete: tests written for $phase_heading"
  echo ""

  echo ">>> [Step 2/2] Jr dev implementing: $phase_heading"
  echo ""

  STEP2_PROMPT="Load the measure skill and the build-graph skill. Read $plan_file and the tests just written for phase $phase_heading. Use build-graph before implementation: run build-graph stats ./graph.db when available, inspect the symbols/files touched by the failing tests, and use build-graph callers/deps to understand blast radius before changing exported functions, schemas, routes, or components. If graph.db is missing or stale and the project is TypeScript, run build-graph scan ./ ./graph.db first. Implement the feature logic to make all tests pass (Green phase). Follow existing code patterns in $PROJECT_PATHS. Do NOT modify the tests. Do NOT create new architectural patterns or utility libraries -- reuse existing ones. If a test is impossible to satisfy without breaking architecture or existing patterns, STOP and add a tech-debt item to measure/tech-debt.md with severity (Critical/High/Medium/Low) and a brief description. Keep tech-debt.md at or below 50 lines -- prune resolved items first if needed. Commit implementation with a descriptive Conventional Commit message and update plan.md: mark completed tasks as [x] and record the commit SHA. If structural TypeScript files changed, update graph.db with build-graph update ./graph.db <changed-files> before commit."

  if ! run_role "$JR_RUNNER" "$JR_MODEL" "$JR_AGENT" "$STEP2_PROMPT"; then
    echo "ERROR: Jr dev failed for phase $phase_heading"
    exit 1
  fi

  echo ""
  echo ">>> Step 2 complete: implementation done for $phase_heading"
  echo ""

  if ! has_more_phases "$idx" "$track_id"; then
    echo "=============================================================="
    echo "  Track Closeout Review: $track_id"
    echo "=============================================================="
    echo ""

    FINAL_PROMPT="Load the measure skill and the build-graph skill. You are the dedicated review agent, independent from the senior strategy role. Perform final review for track $track_id. Read measure/index.md, $plan_file, $strategy_file if it exists, and verify all tasks are marked [x] with commit SHAs. Use build-graph to review architectural impact: run build-graph stats ./graph.db when available, inspect changed exported symbols/routes/schemas/components, and use build-graph callers/deps to catch missed caller updates or boundary violations. Review measure/tech-debt.md for items related to this track: (1) if an issue is a quick fix under 5 minutes, fix it now and mark Resolved, (2) if already fixed in this track, mark Resolved with a note, (3) if significant work remains, leave Open with a brief deferral note. Keep tech-debt.md at or below 50 lines. Run the full quality gate: $PROJECT_LINT, $PROJECT_CHECKS, and $PROJECT_TESTS. If PROJECT_DEV_URL is set, use the browser or kimi-webbridge skill to visually verify changes at $PROJECT_DEV_URL when applicable. Commit any fixes with Conventional Commits. If structural TypeScript files changed, update graph.db with build-graph update ./graph.db <changed-files>. If all phases are complete, note that the track is ready for archival."

    if ! run_role "$REVIEW_RUNNER" "$REVIEW_MODEL" "$REVIEW_AGENT" "$FINAL_PROMPT"; then
      echo "WARNING: Review agent final review failed for $track_id"
      echo "Review manually before archiving."
    else
      echo ""
      echo ">>> Track closeout review complete for $track_id"
      echo "    Reminder: Update measure/tracks.md and consider archiving"
      echo "    the track directory to measure/archive/ when verified."
    fi
    echo ""
  fi

  echo "  Phase $i of $TOTAL_PHASES done."
  echo ""
done

echo ""
echo "+--------------------------------------------------------------+"
printf "|   All %d phases processed!                                   |\n" "$TOTAL_PHASES"
echo "+--------------------------------------------------------------+"
echo ""
