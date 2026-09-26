def checksum(body: bytes) -> int:
    return (~sum(body)) & 0xFF


def is_valid(packet: bytes) -> bool:
    if len(packet) < 6:
        return False
    if packet[0] != 0xFF or packet[1] != 0xFF:
        return False
    return packet[-1] == checksum(packet[2:-1])


if __name__ == "__main__":
    good = bytes.fromhex("ff ff 01 04 02 38 02 be")
    bad  = bytes.fromhex("ff ff 01 04 02 38 02 00")

    assert is_valid(good), "FAIL: good packet rejected"
    assert not is_valid(bad), "FAIL: bad packet accepted"
    print("checksum and is_valid: OK")