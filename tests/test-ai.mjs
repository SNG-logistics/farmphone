/**
 * 🧪 ทดสอบ CometAPI — Farm Phone AI Office
 * รันด้วย: node tests/test-ai.mjs
 */

const API_KEY = 'sk-ELFRFo3mqR1ED0QfZ0axtqFjAEw5iwiKvqWlykSxVtO76y1p';
const BASE_URL = 'https://api.cometapi.com/v1';

// ========== Test 1: Simple Chat ==========
async function testChat() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Test 1: Simple Chat (gpt-4o-mini)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'สวัสดี ตอบสั้นๆ ว่าคุณคือ AI อะไร' }
      ],
      max_tokens: 100,
    }),
  });

  const data = await res.json();

  if (data.error) {
    console.log('❌ Error:', data.error.message);
    return false;
  }

  console.log('✅ Response:', data.choices[0].message.content);
  console.log(`📊 Tokens: ${data.usage?.total_tokens || '?'}`);
  console.log(`🤖 Model: ${data.model}`);
  return true;
}

// ========== Test 2: CEO Agent Simulation ==========
async function testCeoAgent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Test 2: CEO Agent — Goal → Mission (gpt-4o-mini)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const systemPrompt = `คุณคือ "16bit.CEO" — Chief Executive AI ของระบบ Farm Phone AI Office
ระบบนี้ควบคุม Device Farm (มือถือหลายเครื่อง) เพื่อจัดการ Social Media Campaigns อัตโนมัติ

หน้าที่: รับ goal จากผู้ใช้ แล้วสร้าง Mission Plan

AI Agents ที่มี:
- 16bit.CEO, 16bit.MANAGER, 16bit.ANALYST, 16bit.CONTENT, 16bit.DESIGNER
- 16bit.VIDEO, 16bit.SCHEDULER, 16bit.DEVICE, 16bit.API, 16bit.UPLOADER
- 16bit.SECURITY, 16bit.QA, 16bit.DATA, 16bit.NOTIFIER, 16bit.LOG

ตอบเป็น JSON เท่านั้น:
{
  "missionName": "ชื่อ Mission",
  "description": "รายละเอียด",
  "workflowSteps": [
    { "name": "STEP_NAME", "agentCode": "16bit.XXX", "description": "..." }
  ]
}`;

  const userGoal = 'โพสต์วิดีโอ Product A ลง TikTok 10 บัญชี ใช้เครื่องที่ online กระจายงานให้เท่าๆ กัน';

  console.log(`📝 Goal: "${userGoal}"\n`);
  console.log('⏳ CEO กำลังวิเคราะห์...\n');

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userGoal },
      ],
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await res.json();

  if (data.error) {
    console.log('❌ Error:', data.error.message);
    return false;
  }

  const content = data.choices[0].message.content;
  let plan;

  try {
    plan = JSON.parse(content);
  } catch {
    console.log('❌ JSON parse failed:', content);
    return false;
  }

  console.log(`✅ Mission: "${plan.missionName}"`);
  console.log(`📋 Description: ${plan.description}\n`);
  console.log('📊 Workflow Steps:');
  console.log('┌─────┬────────────────────┬──────────────────┬─────────────────────────────┐');
  console.log('│  #  │ Step               │ Agent            │ Description                 │');
  console.log('├─────┼────────────────────┼──────────────────┼─────────────────────────────┤');

  plan.workflowSteps.forEach((step, i) => {
    const num = String(i + 1).padStart(3);
    const name = step.name.padEnd(18).slice(0, 18);
    const agent = step.agentCode.padEnd(16).slice(0, 16);
    const desc = step.description.slice(0, 27).padEnd(27);
    console.log(`│ ${num} │ ${name} │ ${agent} │ ${desc} │`);
  });

  console.log('└─────┴────────────────────┴──────────────────┴─────────────────────────────┘');
  console.log(`\n📊 Tokens: ${data.usage?.total_tokens || '?'} | Model: ${data.model}`);
  return true;
}

// ========== Run All Tests ==========
async function main() {
  console.log('🚀 Farm Phone AI Office — CometAPI Test');
  console.log(`🔗 Base URL: ${BASE_URL}`);
  console.log(`🔑 API Key: ${API_KEY.slice(0, 10)}...${API_KEY.slice(-4)}`);

  let passed = 0;
  let failed = 0;

  try {
    if (await testChat()) passed++; else failed++;
  } catch (e) {
    console.log('❌ Test 1 crashed:', e.message);
    failed++;
  }

  try {
    if (await testCeoAgent()) passed++; else failed++;
  } catch (e) {
    console.log('❌ Test 2 crashed:', e.message);
    failed++;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
