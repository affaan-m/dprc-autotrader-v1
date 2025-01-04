import base58

# Given private key as an array
private_key_array = [
    165, 161, 94, 31, 122, 184, 65, 104, 113, 238, 88, 38, 218, 34, 140, 250,
    181, 109, 168, 204, 128, 176, 105, 33, 34, 170, 50, 93, 140, 235, 16, 70,
    236, 151, 86, 206, 25, 141, 117, 171, 19, 235, 28, 14, 99, 60, 238, 62,
    52, 193, 113, 137, 101, 64, 23, 4, 64, 10, 163, 132, 179, 14, 40, 167
]

# Convert the array to a Base58 encoded string
base58_encoded_key = base58.b58encode(bytes(private_key_array)).decode("utf-8")
print("Base58 Encoded Key:", base58_encoded_key)
