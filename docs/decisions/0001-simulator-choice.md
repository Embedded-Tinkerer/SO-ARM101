# 0001 · Simulator Choice: Icarus Verilog and Verilator with cocotb

**Date:** 2026-09-24  
**Status:** accepted  

## Context

The SO-ARM101 FPGA controller requires rapid, automated digital logic simulation from early ramp-up (R3/R4 UART transmitter and receiver) through full AXI-Lite packet engine verification (W5). Vivado's native simulator (xsim) is slower for quick iterative testbench development, and the Basic license tier imposes constraints. We are using `cocotb` (Python-based coroutine simulation environment) to verify our Verilog modules before hardware synthesis.

## Options Considered

1. **Icarus Verilog (`iverilog`):**
   - *Pros:* Lightweight, standard Verilog/SystemVerilog 2012 (`-g2012`) support, direct event-driven simulation, zero compile overhead, straightforward waveform generation with GTKWave (`$dumpfile` / `$dumpvars`), native support in cocotb.
   - *Cons:* Slower on large designs compared to compiled cycle-based simulators; partial SystemVerilog feature support.

2. **Verilator:**
   - *Pros:* Fast C++ compilation, highly strict linting, excellent for cycle-accurate simulation and complex SystemVerilog constructs (`always_ff`, interfaces, packed structs).
   - *Cons:* 2-state cycle simulation requires careful handling of undefined states (`X`/`Z`), longer compile times for small modules.

3. **Vivado Simulator (`xsim`):**
   - *Pros:* Matches target FPGA synthesis tool, full Xilinx primitive and IP simulation models.
   - *Cons:* Heavyweight CLI / GUI startup overhead, less pleasant for fast test-driven cocotb loops.

## Decision

- **Primary default for ramp-up and unit-level RTL (R3–R5, W5):** **Icarus Verilog (`iverilog -g2012`)** driven by `cocotb` and inspected with `gtkwave`.
- **Secondary / Linting:** **Verilator** will be used for strict static linting (`verilator --lint-only`) and larger block simulation where cycle performance is required.
- Both tools are installed natively on the primary Linux host.

## Consequences

- Tests in `test/cocotb/` will default to `SIM=iverilog`.
- RTL written for unit tests must remain within clean Verilog-2001 / supported IEEE 1800-2012 constructs supported by Icarus.
- Testbenches will output standard VCD waveforms viewable directly in GTKWave.

## How this could be revisited

If packet engine RTL or HLS filtering blocks require unsupported SystemVerilog constructs or simulation runtimes become a bottleneck during W6/W10, we will switch `cocotb`'s `SIM` environment variable to `verilator` without altering testbench logic.
