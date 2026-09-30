# pktview — HX Servo Packet Inspector

A command-line tool to inspect, validate, and summarize serial packets for the HX servo protocol.

## Features

- **Validation:** Verifies header (`0xFF 0xFF`), length byte match, and protocol checksum (`~sum(fields) & 0xFF`).
- **Formatted Table:** Displays valid packets formatted cleanly into individual fields (`Line`, `Header`, `ID`, `Len`, `Instr`, `Checksum`, `Params`).
- **CSV Export:** Exports parsed valid packets into a CSV for spreadsheet analysis and further processing.
- **Histogram Plot:** Generates a histogram showing the distribution of valid packet lengths.
- **Error Tracking:** Distinguishes between corrupted packets (invalid checksum / length) and malformed lines (bad hex string).

## Usage

```bash
python3 pktview.py packets.txt
```

### Options

```text
usage: pktview.py [-h] [--csv CSV] [--plot PLOT] filename

Inspect, validate, and summarize HX servo packets

positional arguments:
  filename     Path to packets text file (e.g. packets.txt)

options:
  -h, --help   show this help message and exit
  --csv CSV    Output CSV path (default: valid_packets.csv)
  --plot PLOT  Output plot path (default: packet_lengths.png)
```

## Example Output

### Console Output
```text
Reading packets from: packets.txt
Summary: 4 valid, 5 invalid, 1 malformed

=================================================================
Line   Header   ID   Len   Instr    Checksum   Params
=================================================================
1      FF FF    1    4     0x02     0xBE       38 02
3      FF FF    1    4     0x02     0xBE       38 02
5      FF FF    1    4     0x02     0xBE       38 02
6      FF FF    1    4     0x02     0xBE       38 02
=================================================================
Exported valid packets to: valid_packets.csv
Saved packet length histogram to: packet_lengths.png
```

### Generated Files
- `valid_packets.csv`: CSV file containing columns `line_num`, `header`, `id`, `length`, `instr`, `params`, `checksum`, `total_length`.
- `packet_lengths.png`: Histogram plot of the packet length distribution.
