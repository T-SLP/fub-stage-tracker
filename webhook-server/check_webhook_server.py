"""
Quick diagnostic script to check your deployed webhook server status
"""
import requests
import json

def check_webhook_server():
    """Check the status of your deployed webhook server"""
    
    # You'll need to replace this with your actual Railway app URL
    base_url = input("Enter your Railway app URL (e.g., https://your-app-name.railway.app): ").strip()
    
    if not base_url.startswith('http'):
        base_url = 'https://' + base_url
    
    print(f"🔍 Checking webhook server at: {base_url}")
    
    # Test 1: Health Check
    print(f"\n1️⃣ Testing Health Check...")
    try:
        response = requests.get(f"{base_url}/health", timeout=10)
        if response.status_code == 200:
            health_data = response.json()
            print(f"   ✅ Server is running!")
            print(f"   📊 Status: {health_data.get('status', 'unknown')}")
            print(f"   🕐 Uptime: {health_data.get('uptime_hours', 0)} hours")
            print(f"   📥 Webhooks received: {health_data.get('webhooks_received', 0)}")
            print(f"   ✅ Webhooks processed: {health_data.get('webhooks_processed', 0)}")
            print(f"   🎯 Stage changes captured: {health_data.get('stage_changes_captured', 0)}")
        else:
            print(f"   ❌ Health check failed: {response.status_code}")
            print(f"   Response: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Cannot reach server: {e}")
        return False
    
    # Test 2: Configuration Check
    print(f"\n2️⃣ Testing Configuration...")
    try:
        response = requests.get(f"{base_url}/stats", timeout=10)
        if response.status_code == 200:
            stats_data = response.json()
            config = stats_data.get('configuration', {})
            
            print(f"   📝 Configuration Status:")
            print(f"   - FUB API Key: {'✅ Set' if config.get('fub_api_configured') else '❌ Missing'}")
            print(f"   - FUB System Key: {'✅ Set' if config.get('fub_system_key_configured') else '❌ Missing'}")
            print(f"   - Database URL: {'✅ Set' if config.get('database_configured') else '❌ Missing'}")
            print(f"   - Webhook Base URL: {config.get('webhook_base_url', '❌ Missing')}")
            
            # Check if any config is missing
            missing_config = []
            if not config.get('fub_api_configured'):
                missing_config.append('FUB_API_KEY')
            if not config.get('fub_system_key_configured'):
                missing_config.append('FUB_SYSTEM_KEY')
            if not config.get('database_configured'):
                missing_config.append('SUPABASE_DB_URL')
            
            if missing_config:
                print(f"   ⚠️  Missing environment variables: {', '.join(missing_config)}")
            else:
                print(f"   ✅ All configuration looks good!")
                
        else:
            print(f"   ❌ Stats check failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Cannot get stats: {e}")
    
    # Test 3: Webhook Registration Status
    print(f"\n3️⃣ Testing Webhook Registration...")
    try:
        # Try to register webhooks
        response = requests.post(f"{base_url}/register", timeout=30)
        if response.status_code == 200:
            register_data = response.json()
            print(f"   ✅ Webhook registration successful!")
            print(f"   📡 Events registered: {register_data.get('events_registered', [])}")
            print(f"   🔗 Webhook URL: {register_data.get('webhook_url', 'unknown')}")
        elif response.status_code == 500:
            print(f"   ❌ Webhook registration failed!")
            print(f"   This usually means missing FUB credentials or network issues.")
            print(f"   Response: {response.text}")
        else:
            print(f"   ⚠️  Unexpected registration response: {response.status_code}")
            print(f"   Response: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Cannot test webhook registration: {e}")
    
    print(f"\n🏁 Diagnostic Complete!")
    print(f"\n💡 Next Steps:")
    print(f"   1. If server is not running: Check Railway deployment logs")
    print(f"   2. If missing environment variables: Set them in Railway dashboard")
    print(f"   3. If webhooks not registered: Fix credentials and run /register endpoint")
    print(f"   4. Test by changing a stage in FUB and checking /health for webhook count")

if __name__ == "__main__":
    check_webhook_server()