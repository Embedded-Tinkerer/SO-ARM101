import csv
from packets import is_valid

valid_count = 0
invalid_count = 0
malformed_count = 0
failed_lines = []

with open("packets.txt", "r") as infile, open("packets.csv", "w", newline="") as outfile:
    writer = csv.writer(outfile)
    writer.writerow(["line_number", "packet_hex", "status"])
    
    for line_num, line in enumerate(infile, start=1):
        raw_line = line.strip()
        if not raw_line:
            continue


        try:
            data = bytes.fromhex(raw_line)
            if is_valid(data):
                status = "VALID"
                valid_count += 1
            else:
                status = "INVALID"
                invalid_count += 1
                failed_lines.append(line_num)
            
        except ValueError:
            status = "MALFORMED"
            malformed_count += 1
            failed_lines.append(line_num)
        writer.writerow([line_num, raw_line, status])

print(f"Summary:")
print(f"Valid : {valid_count}")
print(f"Invalid : {invalid_count}")
print(f"Malformed : {malformed_count}")
print(f"Failed line numbers: {failed_lines}")
