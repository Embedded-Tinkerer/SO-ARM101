# Project Risk Register

| Risk ID | Description | Severity | Likelihood | Mitigation / Contingency Plan | Status |
|---|---|---|---|---|---|
| **RSK-01** | **Over-voltage Hazard on Servos:** Both follower (HX-30HM) and leader (HX-10HM) servos are rated for 9.0–12.6 V maximum. Applying >12.6 V (e.g. from 13.8 V, 15 V, or 24 V bench supplies/adapters sharing barrel plug) will destroy all 12 servos simultaneously. | Critical | Med | Standing procedure: vocal rail check before every power-on ("12.0 V, limit 5 A, output off"). Active over-voltage cutoff circuit designed into custom shield (W7/W8). Dedicated labels on all matching barrel supplies. | Open (Procedure active) |
| **RSK-02** | **PCB Fab & Component Lead Times:** Shield board fab and assembly via JLCPCB must be released by Sat Dec 19 (Gate 2, W8) to be manufactured over the 2-week holiday buffer (Dec 21 – Jan 3). Component stockouts (INA226, SN74LVC1T45) or fab delays slip W9 bring-up. | High | Med | Standard JLCPCB parts pre-checked during W0/W7. Prototype interim bus drivers tested on breadboard in R4/W6 so PL firmware bring-up can proceed even if PCB is delayed. | Open |
| **RSK-03** | **Vivado Basic Node-Locked License Expiration:** Free Basic tier license is tied to laptop MAC/HostID and valid for 1 year from activation. | Med | Low | Calendar reminder set for annual license renewal. Windows desktop kept as secondary licensed host. | Monitored |
| **RSK-04** | **Serial Port Dropping / CH341 Interception:** Linux braille daemon (`brltty`) seizing CH341 USB-to-serial adapter upon plug-in. | Med | High | `brltty` package removed. All python scripts must reference persistent paths under `/dev/serial/by-id/` rather than volatile `/dev/ttyUSB*`. | Resolved |
| **RSK-05** | **Single BusLinker Bottleneck:** Simultaneous teleoperation baseline over USB in W3 requires independent communication channels for both arms. | Med | Med | Verified during W0 inventory; second BusLinker V3.0 ordered if kit contains only one. | Pending hardware count |
| **RSK-06** | **Protocol Misalignment with Community STS3215:** Community SO-ARM101 guides assume Feetech SCS/STS servos, whereas Hiwonder kit uses HX-series magnetic encoder protocol. Applying Feetech registers will cause erratic behavior. | High | Low | Treat Hiwonder protocol specification as ground truth. W3 dedicates protocol decoding and driver implementation to vendor spec. | Addressed in plan |

---

## Log of Orders & Delivery Tracking

| Item | Order Date | Supplier | Expected Delivery | Actual Arrival | Notes |
|---|---|---|---|---|---|
| microSD 32GB A1 | *Pending* | | | | For PYNQ v3.1.1 image |
| 3.3V USB-UART Adapter | *Pending* | | | | CP2102/CH340/FTDI for R2 loopback / R4 UART |
| SN74LVC1T45 / 74LVC1G125 breakouts | *Pending* | | | | Breadboard driver prototypes |
| INA226 current sense breakouts | *Pending* | | | | Current monitoring |
| Latching mushroom e-stop | *Pending* | | | | Hardware safety interlock |
