"""
Script untuk membuat users secara batch
Berguna untuk setup awal sistem
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database_manager import DatabaseManager
from app.auth_manager import AuthManager

def create_default_users():
    """Buat default users untuk testing dan development"""
    
    print("=" * 60)
    print("  SIABSEN - Create Default Users")
    print("=" * 60)
    print()
    
    db = DatabaseManager()
    auth = AuthManager(db)
    
    users_to_create = [
        {
            'username': 'admin',
            'password': 'admin123',
            'full_name': 'Administrator',
            'email': 'admin@siabsen.local',
            'role': 'admin',
            'mahasiswa_id': None
        },
        {
            'username': 'timdis01',
            'password': 'timdis123',
            'full_name': 'Tim Disiplin 1',
            'email': 'timdis01@siabsen.local',
            'role': 'timdis',
            'mahasiswa_id': None
        },
        {
            'username': 'timdis02',
            'password': 'timdis123',
            'full_name': 'Tim Disiplin 2',
            'email': 'timdis02@siabsen.local',
            'role': 'timdis',
            'mahasiswa_id': None
        }
    ]
    
    print("Creating users...\n")
    
    created_count = 0
    skipped_count = 0
    
    for user_data in users_to_create:
        result = auth.create_user(
            username=user_data['username'],
            password=user_data['password'],
            full_name=user_data['full_name'],
            email=user_data['email'],
            role=user_data['role'],
            mahasiswa_id=user_data['mahasiswa_id']
        )
        
        if result['success']:
            print(f"✓ Created: {user_data['username']} ({user_data['role']})")
            print(f"  Password: {user_data['password']}")
            created_count += 1
        else:
            if 'sudah digunakan' in result['message']:
                print(f"⊘ Skipped: {user_data['username']} (already exists)")
                skipped_count += 1
            else:
                print(f"✗ Failed: {user_data['username']} - {result['message']}")
    
    print()
    print("=" * 60)
    print(f"Summary: {created_count} created, {skipped_count} skipped")
    print("=" * 60)
    print()
    
    if created_count > 0:
        print("⚠️  IMPORTANT: Change default passwords after first login!")
        print()

def create_mahasiswa_users(auto_confirm=False):
    """Buat user accounts untuk semua mahasiswa yang belum punya akun"""
    
    print("=" * 60)
    print("  SIABSEN - Create Mahasiswa User Accounts")
    print("=" * 60)
    print()
    
    db = DatabaseManager()
    auth = AuthManager(db)
    
    # Get all mahasiswa
    mahasiswa_list = db._execute("""
        SELECT m.id, m.name, m.email
        FROM mahasiswa m
        LEFT JOIN users u ON m.id = u.mahasiswa_id
        WHERE u.id IS NULL AND m.is_active = 1
    """, fetch_all=True)
    
    if not mahasiswa_list:
        print("✓ All active mahasiswa already have user accounts")
        print()
        return
    
    print(f"Found {len(mahasiswa_list)} mahasiswa without user accounts\n")
    
    if not auto_confirm:
        confirm = input("Create user accounts for all? (y/n): ")
        if confirm.lower() != 'y':
            print("Cancelled")
            return
    
    print()
    print("Creating accounts...\n")
    
    created_count = 0
    failed_count = 0
    
    for mhs in mahasiswa_list:
        # Generate username from mahasiswa ID (lowercase)
        username = mhs['id'].lower()
        
        # Default password: mahasiswa ID (user should change after first login)
        password = mhs['id']
        
        result = auth.create_user(
            username=username,
            password=password,
            full_name=mhs['name'],
            email=mhs['email'] or '',
            role='mahasiswa',
            mahasiswa_id=mhs['id']
        )
        
        if result['success']:
            print(f"✓ Created: {username} ({mhs['name']})")
            print(f"  Password: {password}")
            created_count += 1
        else:
            print(f"✗ Failed: {username} - {result['message']}")
            failed_count += 1
    
    print()
    print("=" * 60)
    print(f"Summary: {created_count} created, {failed_count} failed")
    print("=" * 60)
    print()
    
    if created_count > 0:
        print("⚠️  IMPORTANT:")
        print("   - Default password = Mahasiswa ID")
        print("   - Users should change password after first login")
        print()

def create_custom_user():
    """Interactive mode untuk membuat user custom"""
    
    print("=" * 60)
    print("  SIABSEN - Create Custom User")
    print("=" * 60)
    print()
    
    db = DatabaseManager()
    auth = AuthManager(db)
    
    # Get input
    username = input("Username: ").strip()
    if not username:
        print("✗ Username tidak boleh kosong")
        return
    
    password = input("Password: ").strip()
    if not password:
        print("✗ Password tidak boleh kosong")
        return
    
    full_name = input("Full Name: ").strip()
    if not full_name:
        print("✗ Full name tidak boleh kosong")
        return
    
    email = input("Email (optional): ").strip()
    
    print("\nRole:")
    print("  1. Admin")
    print("  2. Timdis")
    print("  3. Mahasiswa")
    role_choice = input("Pilih role (1-3): ").strip()
    
    role_map = {'1': 'admin', '2': 'timdis', '3': 'mahasiswa'}
    role = role_map.get(role_choice)
    
    if not role:
        print("✗ Role tidak valid")
        return
    
    mahasiswa_id = None
    if role == 'mahasiswa':
        mahasiswa_id = input("Mahasiswa ID: ").strip()
        if not mahasiswa_id:
            print("✗ Mahasiswa ID wajib untuk role mahasiswa")
            return
    
    print()
    print("Creating user...")
    
    result = auth.create_user(
        username=username,
        password=password,
        full_name=full_name,
        email=email,
        role=role,
        mahasiswa_id=mahasiswa_id
    )
    
    if result['success']:
        print(f"✓ User created successfully!")
        print(f"  User ID: {result['user_id']}")
        print(f"  Username: {username}")
        print(f"  Role: {role}")
    else:
        print(f"✗ Failed: {result['message']}")
    
    print()

def seed_all_users():
    """Seed semua users sekaligus (default + mahasiswa) - AUTO MODE"""
    
    print("=" * 60)
    print("  SIABSEN - SEED ALL USERS (AUTO)")
    print("=" * 60)
    print()
    
    print("This will create:")
    print("  1. Default admin and timdis accounts")
    print("  2. User accounts for all mahasiswa")
    print()
    
    confirm = input("Continue? (y/n): ")
    if confirm.lower() != 'y':
        print("Cancelled")
        return
    
    print()
    print("=" * 60)
    print("STEP 1: Creating default users...")
    print("=" * 60)
    create_default_users()
    
    print()
    print("=" * 60)
    print("STEP 2: Creating mahasiswa accounts...")
    print("=" * 60)
    create_mahasiswa_users(auto_confirm=True)
    
    print()
    print("=" * 60)
    print("✓ SEEDING COMPLETED!")
    print("=" * 60)
    print()

def reset_mahasiswa_passwords():
    """Reset password semua mahasiswa ke default (ID mereka)"""
    
    print("=" * 60)
    print("  SIABSEN - Reset Mahasiswa Passwords")
    print("=" * 60)
    print()
    
    print("⚠️  WARNING: This will reset ALL mahasiswa passwords to their ID!")
    print()
    
    confirm = input("Are you sure? Type 'RESET' to confirm: ")
    if confirm != 'RESET':
        print("Cancelled")
        return
    
    db = DatabaseManager()
    auth = AuthManager(db)
    
    # Get all mahasiswa users
    mahasiswa_users = db._execute("""
        SELECT u.id, u.username, u.mahasiswa_id, m.name
        FROM users u
        JOIN mahasiswa m ON u.mahasiswa_id = m.id
        WHERE u.role = 'mahasiswa'
    """, fetch_all=True)
    
    if not mahasiswa_users:
        print("No mahasiswa users found")
        return
    
    print(f"\nResetting passwords for {len(mahasiswa_users)} mahasiswa...\n")
    
    reset_count = 0
    failed_count = 0
    
    for user in mahasiswa_users:
        try:
            # New password = mahasiswa ID
            new_password = user['mahasiswa_id']
            password_hash = auth.hash_password(new_password)
            
            db._execute("""
                UPDATE users SET password_hash = %s WHERE id = %s
            """, (password_hash, user['id']))
            
            # Invalidate all sessions
            db._execute("""
                DELETE FROM sessions WHERE user_id = %s
            """, (user['id'],))
            
            print(f"✓ Reset: {user['username']} ({user['name']}) → password: {new_password}")
            reset_count += 1
            
        except Exception as e:
            print(f"✗ Failed: {user['username']} - {str(e)}")
            failed_count += 1
    
    print()
    print("=" * 60)
    print(f"Summary: {reset_count} reset, {failed_count} failed")
    print("=" * 60)
    print()

def export_user_credentials():
    """Export semua credentials mahasiswa ke file CSV"""
    
    print("=" * 60)
    print("  SIABSEN - Export User Credentials")
    print("=" * 60)
    print()
    
    db = DatabaseManager()
    
    # Get all mahasiswa users
    mahasiswa_users = db._execute("""
        SELECT u.username, u.mahasiswa_id, m.name, m.kelompok, m.jurusan, m.email
        FROM users u
        JOIN mahasiswa m ON u.mahasiswa_id = m.id
        WHERE u.role = 'mahasiswa' AND u.is_active = 1
        ORDER BY m.kelompok, m.name
    """, fetch_all=True)
    
    if not mahasiswa_users:
        print("No mahasiswa users found")
        return
    
    import csv
    from datetime import datetime
    
    filename = f"mahasiswa_credentials_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['No', 'Mahasiswa ID', 'Nama', 'Kelompok', 'Jurusan', 'Email', 'Username', 'Password'])
        
        for idx, user in enumerate(mahasiswa_users, 1):
            writer.writerow([
                idx,
                user['mahasiswa_id'],
                user['name'],
                user['kelompok'],
                user['jurusan'],
                user['email'] or '-',
                user['username'],
                user['mahasiswa_id']  # Default password = ID
            ])
    
    print(f"✓ Exported {len(mahasiswa_users)} credentials to: {filename}")
    print()
    print("⚠️  IMPORTANT: Keep this file secure! It contains login credentials.")
    print()

def list_users():
    """List semua users"""
    
    print("=" * 60)
    print("  SIABSEN - List All Users")
    print("=" * 60)
    print()
    
    db = DatabaseManager()
    auth = AuthManager(db)
    
    users = auth.get_all_users()
    
    if not users:
        print("No users found")
        return
    
    print(f"Total users: {len(users)}\n")
    
    # Group by role
    by_role = {}
    for user in users:
        role = user['role']
        if role not in by_role:
            by_role[role] = []
        by_role[role].append(user)
    
    for role in ['admin', 'timdis', 'mahasiswa']:
        if role not in by_role:
            continue
        
        print(f"\n{role.upper()}:")
        print("-" * 60)
        
        for user in by_role[role]:
            status = "✓ Active" if user['is_active'] else "✗ Inactive"
            last_login = user['last_login'] or 'Never'
            
            print(f"  {user['username']:<20} {user['full_name']:<30} {status}")
            if user['mahasiswa_id']:
                print(f"    Mahasiswa ID: {user['mahasiswa_id']}")
            print(f"    Last Login: {last_login}")
    
    print()

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python create_users.py default       - Create default users (admin, timdis)")
        print("  python create_users.py mahasiswa     - Create accounts for all mahasiswa")
        print("  python create_users.py seed          - Seed all users (default + mahasiswa)")
        print("  python create_users.py custom        - Create custom user (interactive)")
        print("  python create_users.py list          - List all users")
        print("  python create_users.py reset         - Reset all mahasiswa passwords")
        print("  python create_users.py export        - Export mahasiswa credentials to CSV")
        print()
        return
    
    command = sys.argv[1].lower()
    
    try:
        if command == 'default':
            create_default_users()
        elif command == 'mahasiswa':
            create_mahasiswa_users()
        elif command == 'seed':
            seed_all_users()
        elif command == 'custom':
            create_custom_user()
        elif command == 'list':
            list_users()
        elif command == 'reset':
            reset_mahasiswa_passwords()
        elif command == 'export':
            export_user_credentials()
        else:
            print(f"Unknown command: {command}")
            print("Use: default, mahasiswa, seed, custom, list, reset, or export")
    except KeyboardInterrupt:
        print("\n\nCancelled by user\n")
    except Exception as e:
        print(f"\n✗ Error: {e}\n")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
