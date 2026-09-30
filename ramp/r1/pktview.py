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

def main():
    parser = argparse.ArgumentParser(description="Inspect, validate, and summarize HX servo packets")
    parser.add_argument("filename", help="Path to packets text file (e.g. packets.txt)")
    args = parser.parse_args()

    print(f"Reading packets from: {args.filename}")
    valid_packets, invalid_count, malformed_count = process_packets(args.filename)

    print(f"Summary: {len(valid_packets)} valid, {invalid_count} invalid, {malformed_count} malformed")
    if valid_packets:
        print_table(valid_packets)



if __name__ == "__main__":
    main()