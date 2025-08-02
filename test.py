get_password = input("enter:")
print(f"{get_password[0]}{("*" * (len(get_password) - 2))}{get_password[-1]}")