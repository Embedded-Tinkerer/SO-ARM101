"""HX Servo Packet module: Packet class and protocol exceptions."""

class PacketError(Exception):
    """Base exception for all packet errors."""
    pass


class ChecksumError(PacketError):
    """Raised when the packet checksum does not match the computed value."""
    pass


class HeaderError(PacketError):
    """Raised when the packet does not start with 0xFF 0xFF."""
    pass


class LengthError(PacketError):
    """Raised when packet byte count or length field is invalid."""
    pass


def compute_checksum(body: bytes) -> int:
    """Compute protocol checksum: ~sum(id, len, instr, params) & 0xFF."""
    return (~sum(body)) & 0xFF


class Packet:
    """Represents a valid HX servo protocol packet."""

    HEADER = b"\xff\xff"

    def __init__(self, raw: bytes):
        if not isinstance(raw, (bytes, bytearray)):
            raise TypeError(f"Packet must be bytes or bytearray, got {type(raw).__name__}")

        if len(raw) < 6:
            raise LengthError(f"Packet too short: {len(raw)} bytes (minimum is 6)")

        if raw[:2] != self.HEADER:
            raise HeaderError(f"Invalid header: {raw[:2].hex(' ').upper()} (expected FF FF)")

        length_field = raw[3]
        expected_len = length_field + 4  # header(2) + id(1) + len(1) + payload(length_field)
        if len(raw) != expected_len:
            raise LengthError(
                f"Packet length mismatch: declared {expected_len} bytes from length field {length_field}, got {len(raw)}"
            )

        calc_checksum = compute_checksum(raw[2:-1])
        actual_checksum = raw[-1]
        if actual_checksum != calc_checksum:
            raise ChecksumError(
                f"Checksum mismatch: expected 0x{calc_checksum:02X}, got 0x{actual_checksum:02X}"
            )

        self._raw = bytes(raw)
        self.id = raw[2]
        self.length = raw[3]
        self.instr = raw[4]
        self.params = bytes(raw[5:-1])
        self.checksum = actual_checksum

    @classmethod
    def build(cls, servo_id: int, instr: int, params: bytes = b"") -> "Packet":
        """Build a Packet from individual fields."""
        if not (0 <= servo_id <= 254):
            raise ValueError(f"Invalid servo ID: {servo_id}")
        if not (0 <= instr <= 255):
            raise ValueError(f"Invalid instruction: {instr}")

        length_field = len(params) + 2
        body = bytes([servo_id, length_field, instr]) + bytes(params)
        chk = compute_checksum(body)
        raw = cls.HEADER + body + bytes([chk])
        return cls(raw)

    def to_bytes(self) -> bytes:
        """Return the raw wire bytes of the packet."""
        return self._raw

    def __bytes__(self) -> bytes:
        return self._raw

    def __repr__(self) -> str:
        params_hex = self.params.hex(" ").upper() if self.params else "(none)"
        return (
            f"Packet(id={self.id}, instr=0x{self.instr:02X}, "
            f"params={params_hex}, checksum=0x{self.checksum:02X})"
        )

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Packet):
            return self._raw == other._raw
        return False
