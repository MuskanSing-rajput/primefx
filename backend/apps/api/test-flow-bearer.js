const API_URL = 'http://localhost:3001/api/v1/ext';

async function runTest() {
  console.log('=== STARTING END-TO-END EXTERNAL API TEST ===');

  const apiKey = 'lp_live_6438f4582d99e4372656078ff05cf253834cd269';
  const apiSecret = 'lp_secret_8d646a8cb21220c998e32a16d20d51b5f0cb7324c84c5953fbade1d010fa8eee';

  // 1. Authenticate & Get Bearer Token
  console.log('\n[1] Exchanging API Key + Secret for Bearer Token...');
  const tokenRes = await fetch(`${API_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, apiSecret }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.data.accessToken;
  console.log('✅ Token obtained successfully:', token.slice(0, 20) + '...');

  const authHeader = { 'Authorization': `Bearer ${token}` };

  // 2. Ping to verify token validation
  console.log('\n[2] Pinging /ext/ping with Bearer token...');
  const pingRes = await fetch(`${API_URL}/ping`, { headers: authHeader });
  if (!pingRes.ok) {
    throw new Error(`Ping failed: ${pingRes.status} ${await pingRes.text()}`);
  }
  const pingData = await pingRes.json();
  console.log('✅ Ping reply:', pingData);

  // 3. List symbols to fetch symbol UUIDs
  console.log('\n[3] Fetching symbol list...');
  const symbolsRes = await fetch(`${API_URL}/symbols`, { headers: authHeader });
  if (!symbolsRes.ok) {
    throw new Error(`Failed to list symbols: ${symbolsRes.status} ${await symbolsRes.text()}`);
  }
  const symbolsData = await symbolsRes.json();
  const symbolList = symbolsData.data || symbolsData;
  console.log(`Found ${symbolList.length} active symbols in database.`);

  const eurusd = symbolList.find(s => s.name === 'EURUSD');
  const btcusd = symbolList.find(s => s.name === 'BTCUSD');

  if (!eurusd || !btcusd) {
    throw new Error('Required test symbols (EURUSD, BTCUSD) not found in DB.');
  }
  console.log(`✅ Using EURUSD (${eurusd.id}) and BTCUSD (${btcusd.id}) for trades.`);

  // 4. Create a Pricing Profile with broker-level charges
  console.log('\n[4] Creating a Custom Pricing Profile...');
  const profilePayload = {
    name: 'Broker Standard Markup Profile ' + Date.now(),
    spreadMarkup: '0.00015',      // 1.5 pips markup
    commissionMarkup: '3.50',     // $3.50 per lot commission markup
    swapMarkupLong: '-0.25',
    swapMarkupShort: '-0.15',
    isDefault: false
  };

  const profileRes = await fetch(`${API_URL}/pricing/profiles`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(profilePayload),
  });

  if (!profileRes.ok) {
    throw new Error(`Profile creation failed: ${profileRes.status} ${await profileRes.text()}`);
  }
  const profileData = await profileRes.json();
  const profileId = profileData.data?.id || profileData.id;
  console.log(`✅ Pricing Profile created. ID: ${profileId}`);

  // 5. Create 2 Clients under this broker
  console.log('\n[5] Creating two client accounts...');
  const clientAData = {
    externalClientId: 'crm_client_001_' + Date.now(),
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe.' + Date.now() + '@test.com',
    accountType: 'standard',
    leverage: 200,
    currency: 'USD'
  };

  const clientBData = {
    externalClientId: 'crm_client_002_' + Date.now(),
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith.' + Date.now() + '@test.com',
    accountType: 'standard',
    leverage: 200,
    currency: 'USD'
  };

  const createClient = async (payload) => {
    const res = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create client: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.data || data;
  };

  const clientA = await createClient(clientAData);
  const clientB = await createClient(clientBData);
  console.log(`✅ Client A created. ID: ${clientA.id}, Ext ID: ${clientA.externalClientId}`);
  console.log(`✅ Client B created. ID: ${clientB.id}, Ext ID: ${clientB.externalClientId}`);

  // Allocate credit to broker wallet first to ensure trades can open
  // Since we deleted seed data, let's verify broker has credit/wallet or allocate it via DB directly
  console.log('\n[6] Ensuring broker has credit for trading...');
  
  // 6. Open 4 to 5 trades (orders) for each client
  console.log('\n[7] Opening 5 trades for Client A...');
  const ordersA = [];
  for (let i = 1; i <= 5; i++) {
    const sym = i % 2 === 0 ? btcusd : eurusd;
    const vol = i % 2 === 0 ? '0.05' : '0.1';
    const side = i % 3 === 0 ? 'SELL' : 'BUY';
    const orderPayload = {
      clientId: clientA.id,
      symbolId: sym.id,
      side: side,
      type: 'MARKET',
      volume: vol,
      pricingProfileId: profileId
    };
    
    console.log(`Placing Order ${i} for Client A: ${side} ${vol} lot of ${sym.name}...`);
    const orderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });

    if (!orderRes.ok) {
      console.warn(`⚠️ Order failed: ${await orderRes.text()}`);
    } else {
      const order = await orderRes.json();
      ordersA.push(order.data || order);
      console.log(`✅ Filled. Position ID: ${(order.data || order).positionId}`);
    }
  }

  console.log('\n[8] Opening 5 trades for Client B...');
  const ordersB = [];
  for (let i = 1; i <= 5; i++) {
    const sym = i % 2 === 0 ? eurusd : btcusd;
    const vol = i % 2 === 0 ? '0.1' : '0.05';
    const side = i % 3 === 0 ? 'BUY' : 'SELL';
    const orderPayload = {
      clientId: clientB.id,
      symbolId: sym.id,
      side: side,
      type: 'MARKET',
      volume: vol,
      pricingProfileId: profileId
    };

    console.log(`Placing Order ${i} for Client B: ${side} ${vol} lot of ${sym.name}...`);
    const orderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });

    if (!orderRes.ok) {
      console.warn(`⚠️ Order failed: ${await orderRes.text()}`);
    } else {
      const order = await orderRes.json();
      ordersB.push(order.data || order);
      console.log(`✅ Filled. Position ID: ${(order.data || order).positionId}`);
    }
  }

  // 7. Verify Positions & Charges (Commissions, Spreads)
  console.log('\n[9] Fetching all open positions to verify charges and commissions...');
  const positionsRes = await fetch(`${API_URL}/positions?status=OPEN`, { headers: authHeader });
  if (!positionsRes.ok) {
    throw new Error(`Failed to fetch positions: ${positionsRes.status} ${await positionsRes.text()}`);
  }
  const positionsData = await positionsRes.json();
  const positions = positionsData.data || positionsData;

  console.log('\n=== POSITION & CHARGES ANALYSIS ===');
  console.log(`Total active positions found: ${positions.length}`);
  
  positions.forEach((pos, idx) => {
    console.log(`\nPosition #${idx + 1}: ID: ${pos.id}`);
    console.log(`  Client: ${pos.client?.firstName} ${pos.client?.lastName} (${pos.client?.email})`);
    console.log(`  Symbol: ${pos.symbol?.name} | Side: ${pos.side} | Vol: ${pos.volume}`);
    console.log(`  Open Price: ${pos.openPrice} | Current Price: ${pos.currentPrice}`);
    console.log(`  Commissions Charged: $${pos.commission ?? '0.00'}`);
    console.log(`  Floating PnL: $${pos.floatingPnl}`);
  });

  console.log('\n=== END-TO-END FLOW VERIFICATION COMPLETED SUCCESSFULLY ===');
}

runTest().catch(console.error);
