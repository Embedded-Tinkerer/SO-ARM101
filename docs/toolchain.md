# Toolchain Baseline & Verification

**Host Machine:** Dedicated Linux Laptop  
**Date Verified:** 2026-09-24  
**Operating System:** Ubuntu 26.04.1 LTS (Codename: resolute)  
**Kernel:** Linux 7.0.0-34-generic x86_64  

---

## 1. System & OS

```text
$ lsb_release -a
Distributor ID: Ubuntu
Description:    Ubuntu 26.04.1 LTS
Release:        26.04
Codename:       resolute

$ uname -r
7.0.0-34-generic
```

## 2. FPGA Toolchain (AMD Vivado / Vitis)

- **Installation Path:** `/tools/Xilinx/2026.1/Vivado`
- **Environment:** `source /tools/Xilinx/2026.1/Vivado/settings64.sh` added to `~/.bashrc`
- **Cable Drivers:** Installed via `/tools/Xilinx/2026.1/Vivado/data/xicom/cable_drivers/lin64/` (udev rules `52-xilinx-digilent-usb.rules`, `52-xilinx-ftdi-usb.rules`, `52-xilinx-pcusb.rules` active in `/etc/udev/rules.d/`)
- **License:** AMD Basic (Node-locked, free tier; renew annually)

```text
$ vivado -version
vivado v2026.1 (64-bit)
Tool Version Limit: 2026.06
SW Build 6511674 on Tue Jun 16 11:01:26 MDT 2026
IP Build 6504888 on Tue Jun 09 09:05:25 MDT 2026
SharedData Build 6501428 on Mon Jun 08 17:34:18 MDT 2026
```

## 3. PCB CAD (KiCad)

- **Version:** KiCad 9.0.7 (via snap)
- **Plugin:** JLCPCB/LCSC parts library to be added via Plugin and Content Manager

```text
$ kicad-cli version
9.0.7
```

## 4. HDL Simulators

### Icarus Verilog
```text
$ iverilog -V
Icarus Verilog version 12.0 (stable) ()
Copyright (c) 2000-2021 Stephen Williams (steve@icarus.com)
```

### Verilator
```text
$ verilator --version
Verilator 5.032 2025-01-01 rev (Debian 5.032-1)
```

## 5. Python Environment

- **Virtual Environment:** Symlinked at `/home/capstone/arm-on-zynq/.venv` pointing to `/home/capstone/.venv` (Python 3.14.4)
- **Dependencies:** Freeze exported to `requirements.txt`
- **Key Packages:**
  - `cocotb`: 2.1.0
  - `lerobot`: 0.6.1
  - `torch`: 2.11.0+cu130
  - `opencv-python`: 5.0.0.93
  - `PyVISA`: 1.16.2 (`PyVISA-py`: 0.8.1)
  - `pyserial`: 3.5
  - `pytest`: 9.1.1
  - `numpy`: 2.2.6
  - `matplotlib`: 3.11.2

Verification command:
```text
$ python -c "import cocotb, pyvisa, cv2, torch, lerobot; print('ok: cocotb', cocotb.__version__, 'torch', torch.__version__, 'lerobot', lerobot.__version__)"
ok: cocotb 2.1.0 torch 2.11.0+cu130 lerobot 0.6.1
```

## 6. Serial & Permissions

- User is in `dialout` group (`id -nG | grep dialout`).
- `brltty` service removed to prevent device interception on CH340/CH341 USB-to-serial converters.
- Serial devices are addressed via persistent paths under `/dev/serial/by-id/`.

## 7. Windows Secondary Host (Pending Verification)

- **Host:** Windows Desktop with AMD Radeon RX 9070 XT
- **Tool:** Hiwonder ServoStudio (Windows-only)
- **Version:** *To be recorded upon installation on desktop*
