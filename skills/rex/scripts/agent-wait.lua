-- Wait until an agent in a Rex terminal reports one of the given OSC 7501 states.
--
--   rex do ~/.agents/skills/rex/scripts/agent-wait.lua -b BLOCK [until=done,blocked] [timeout=SECONDS] [fresh=true]
--
-- Prints the matching status record as JSON and exits 0. Exits 124 on timeout,
-- like timeout(1), and 1 when the block has no terminal.
--
-- Lives in a script rather than an init.lua action because rex.wait does not
-- exist in the configuration file.

local TERMINAL = "com.superlogical.terminal"

local block_id = rex.block_id
if not block_id then error("no block: pass -b BLOCK", 0) end

local wanted = {}
for state in (rex.args["until"] or "idle,done,blocked,error"):gmatch("[^,%s]+") do
  wanted[state] = true
end
local timeout = tonumber(rex.args.timeout)

local function is_root(id) return id == nil or id == "" end

local function result(record)
  return { block_id = block_id, state = record.state, kind = record.kind, app = record.app, msg = record.msg }
end

-- fresh=true skips the current record, so a wait started right after sending a
-- prompt is not satisfied by the idle state the agent was in before it began.
if rex.args.fresh ~= "true" then
  local status, err = rex.block.call(TERMINAL, "program_status", { block_id = block_id })
  if not status then error(err, 0) end
  for _, record in ipairs(status.records or {}) do
    if is_root(record.id) and wanted[record.state] then return result(record) end
  end
end

local ev = rex.wait("terminal.program_status_changed", function(e)
  return e.block_id == block_id and is_root(e.id) and wanted[e.record.state] == true
end, timeout)
if not ev then
  io.stderr:write("agent-wait: timed out\n")
  rex.stop(124)
end
return result(ev.record)
