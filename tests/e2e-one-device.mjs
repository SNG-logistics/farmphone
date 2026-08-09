const apiUrl = process.env.API_URL || 'http://localhost:3001/api/v1';

async function request(path, options) {
  const response = await fetch(`${apiUrl}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.message || response.statusText}`);
  return body;
}

async function main() {
  console.log('1/5 ตรวจ API และ ADB');
  const diagnostic = await request('/device-test/devices');
  console.log(`   ${diagnostic.data.message}`);

  console.log('2/5 สร้าง Account ทดสอบ');
  const serial = diagnostic.data.devices.find((device) => device.state === 'device')?.serial || 'NO_DEVICE';
  const account = await request('/accounts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'TikTok', username: `e2e-${Date.now()}`, nickname: 'E2E Channel', assignedDeviceId: serial, status: 'ACTIVE', authStatus: 'MANUAL_CHECK_REQUIRED' }),
  });
  if (!account.data.id) throw new Error('Account ID missing');

  console.log('3/5 ตรวจรายการ Accounts');
  const accounts = await request('/accounts');
  if (!accounts.data.some((item) => item.id === account.data.id)) throw new Error('Created account not found');

  console.log('4/5 ตรวจ Content API');
  const content = await request('/content');
  if (!Array.isArray(content.data)) throw new Error('Content response is not an array');

  console.log('5/5 ตรวจ Campaign API');
  const campaigns = await request('/campaigns');
  if (!Array.isArray(campaigns)) throw new Error('Campaign response is not an array');

  console.log('E2E smoke test ผ่าน');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
