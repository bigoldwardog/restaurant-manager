class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def clean_rut(rut):
    return str(rut or "").replace(".", "").replace(" ", "").upper()


def valid_rut(rut):
    value = clean_rut(rut)
    if "-" not in value:
        return False
    body, verifier = value.split("-", 1)
    if not body.isdigit() or len(body) not in (7, 8) or verifier not in "0123456789K":
        return False
    total = 0
    multiplier = 2
    for digit in reversed(body):
        total += int(digit) * multiplier
        multiplier = 2 if multiplier == 7 else multiplier + 1
    expected_value = 11 - (total % 11)
    expected = "0" if expected_value == 11 else "K" if expected_value == 10 else str(expected_value)
    return verifier == expected


def public_user(user):
    if not user:
        return None
    result = dict(user)
    result.pop("clave", None)
    return result
