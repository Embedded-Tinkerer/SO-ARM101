import argparse
import csv
import sys
import matplotlib.pyplot as plt
from packets import is_valid

def parse_packet_fields(raw_bytes: bytes) -> dict:
    """break a raw packet into HX servo protocol fields"""
    return {
        "header": raw_bytes[:2].hex(" ").upper(),
        "id": raw_bytes[2],
        "length": raw_bytes[3],
        "instr": f"0x{raw_bytes[4]:02X}",
        "params": raw_bytes[5:-1].hex(" ").upper() if len(raw_bytes) > 6 else "(none)",
        "checksum": f"0x{raw_bytes[-1]:02X}",
        "total_length": len(raw_bytes),
    }

def process_packets(filename: str):
    """read packets from the file, print summary statistics"""
    valid_packets = []
    invalid_count = 0
    malformed_count = 0
    
    with open(filename, "r") as f:
        for line_num, line in enumerate(f, start=1):
            raw_str = line.strip()
            if not raw_str:
                continue

            try:
                pkt_bytes = bytes.fromhex(raw_str)
                if is_valid(pkt_bytes):
                    fields = parse_packet_fields(pkt_bytes)
                    fields["line_num"] = line_num
                    valid_packets.append(fields)
                else:
                    invalid_count += 1
            except ValueError:
                malformed_count += 1
    return valid_packets, invalid_count, malformed_count    

def print_table(valid_packets: list):
    """Print an aligned table of valid packets and their fields."""
    header = f"{'Line':<6} {'Header':<8} {'ID':<4} {'Len':<5} {'Instr':<8} {'Checksum':<10} {'Params'}"
    print("\n" + "=" * 65)
    print(header)
    print("=" * 65)
    for p in valid_packets:
        print(
            f"{p['line_num']:<6} {p['header']:<8} {p['id']:<4} {p['length']:<5} "
            f"{p['instr']:<8} {p['checksum']:<10} {p['params']}"
        )
    print("=" * 65)

def export_csv(valid_packets: list, csv_filename: str = "valid_packets.csv"):
    """Export parsed valid packets to a CSV file."""
    with open(csv_filename, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["line_num", "header", "id", "length", "instr", "params", "checksum", "total_length"])
        for p in valid_packets:
            writer.writerow([
                p["line_num"], p["header"], p["id"], p["length"],
                p["instr"], p["params"], p["checksum"], p["total_length"]
            ])
    print(f"Exported valid packets to: {csv_filename}")

def plot_packet_lengths(valid_packets: list, plot_filename: str = "packet_lengths.png"):
    """Generate and save a histogram of valid packet lengths."""
    lengths = [p["total_length"] for p in valid_packets]

    plt.figure(figsize=(8, 5))
    bins = range(min(lengths) - 1, max(lengths) + 3)
    plt.hist(lengths, bins=bins, align="left", rwidth=0.7, color="teal", edgecolor="black")

    plt.title("Distribution of Valid Packet Lengths", fontsize=14, fontweight="bold")
    plt.xlabel("Packet Length (Bytes)", fontsize=12)
    plt.ylabel("Packet Count", fontsize=12)
    plt.grid(axis="y", linestyle="--", alpha=0.6)

    plt.savefig(plot_filename, dpi=300, bbox_inches="tight")
    plt.close()
    print(f"Saved packet length histogram to: {plot_filename}")

def main():
    parser = argparse.ArgumentParser(description="Inspect, validate, and summarize HX servo packets")
    parser.add_argument("filename", help="Path to packets text file (e.g. packets.txt)")
    parser.add_argument("--csv", default="valid_packets.csv", help="Output CSV path (default: valid_packets.csv)")
    parser.add_argument("--plot", default="packet_lengths.png", help="Output plot path (default: packet_lengths.png)")
    args = parser.parse_args()

    print(f"Reading packets from: {args.filename}")
    valid_packets, invalid_count, malformed_count = process_packets(args.filename)

    print(f"Summary: {len(valid_packets)} valid, {invalid_count} invalid, {malformed_count} malformed")
    if valid_packets:
        print_table(valid_packets)
        export_csv(valid_packets, args.csv)
        plot_packet_lengths(valid_packets, args.plot)

if __name__ == "__main__":
    main()