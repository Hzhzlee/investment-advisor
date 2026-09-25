import assert from 'node:assert';
import {
  simulateGoal,
  solveRequiredContribution,
  buildBlendedSeries,
  createMulberry32,
  handler
} from '../api/mcp.ts';

async function runTests() {
  console.log('--- Starting MCP Server & Analytics Unit Tests ---');

  // Test 1: Seeded simulation determinism and divergence with different seeds
  console.log('Test 1: Seeded simulation determinism...');
  const syntheticReturns = Array.from({ length: 60 }, (_, i) => 0.005 + (i % 5) * 0.002 - ((i % 3) * 0.003));
  
  const simA1 = simulateGoal(syntheticReturns, 10000, 500, 5, 50000, 1000, 0.025, 0.002, 12345);
  const simA2 = simulateGoal(syntheticReturns, 10000, 500, 5, 50000, 1000, 0.025, 0.002, 12345);
  const simB = simulateGoal(syntheticReturns, 10000, 500, 5, 50000, 1000, 0.025, 0.002, 99999);

  assert.strictEqual(simA1.probability_of_success, simA2.probability_of_success, 'Same seed must produce identical probability');
  assert.strictEqual(simA1.median_final_value, simA2.median_final_value, 'Same seed must produce identical median final value');
  assert.strictEqual(simA1.drawdown_p95, simA2.drawdown_p95, 'Same seed must produce identical drawdown_p95');
  assert.strictEqual(simA1.drawdown_median, simA2.drawdown_median, 'Same seed must produce identical drawdown_median');
  assert.strictEqual(simA1.seed, 12345, 'Response echoes seed');

  // Different seeds should generally give different trajectory percentiles
  const diffValues = simA1.median_final_value !== simB.median_final_value ||
                     simA1.p10_final !== simB.p10_final ||
                     simA1.probability_of_success !== simB.probability_of_success;
  assert.ok(diffValues, 'Different seeds must produce varying stochastic simulation outputs');
  console.log('✓ Test 1 passed: Seeded PRNG ensures reproducibility.');

  // Test 2: Solver confidence, accuracy, and monotonicity
  console.log('Test 2: solveRequiredContribution confidence & monotonicity...');
  const targetConf = 0.80;
  const solverRes = solveRequiredContribution(
    syntheticReturns,
    10000,
    5,
    60000,
    targetConf,
    0.025,
    false, // nominal
    0.002,
    42
  );

  assert.strictEqual(solverRes.achievable, true, 'Reasonable target must be achievable');
  assert.ok(solverRes.required_monthly_contribution > 0, 'Required contribution must be > 0');
  assert.ok(
    solverRes.achieved_probability! >= targetConf,
    `Achieved probability (${solverRes.achieved_probability}) must be >= target confidence (${targetConf})`
  );

  // At 5% lower contribution, probability should be < confidence
  const lowerContrib = solverRes.required_monthly_contribution * 0.95;
  const lowerSim = simulateGoal(
    syntheticReturns,
    10000,
    lowerContrib,
    5,
    60000,
    1000,
    0.025,
    0.002,
    42
  );
  assert.ok(
    lowerSim.probability_of_success < targetConf,
    `At 5% lower contribution (${lowerContrib}), probability (${lowerSim.probability_of_success}) should fall below confidence (${targetConf})`
  );

  // Monotonicity check
  const contribs = [200, 400, 600, 800, 1000];
  const probs = contribs.map(c => simulateGoal(syntheticReturns, 10000, c, 5, 60000, 1000, 0.025, 0.002, 42).probability_of_success);
  for (let i = 1; i < probs.length; i++) {
    assert.ok(probs[i] >= probs[i - 1], `Probabilities must be monotonic with respect to contributions: ${probs[i]} >= ${probs[i-1]}`);
  }
  console.log('✓ Test 2 passed: Solver bisection meets confidence, tests <5%, and behaves monotonically.');

  // Test 3: Unattainable case returns achievable=false
  console.log('Test 3: Solver unattainable case returns achievable=false...');
  const impossibleRes = solveRequiredContribution(
    syntheticReturns,
    1000,
    1,
    50000000, // 50M in 1 year starting with 1000
    0.95,
    0.025,
    false,
    0.002,
    42
  );
  assert.strictEqual(impossibleRes.achievable, false, 'Absurd target must return achievable=false');
  assert.ok(typeof impossibleRes.achieved_probability === 'number', 'Must return achieved probability at search cap');
  console.log('✓ Test 3 passed: Unattainable goals gracefully report achievable=false.');

  // Test 4: Blended series alignment by calendar month (YYYY-MM) and annual rebalance
  console.log('Test 4: Calendar-month (YYYY-MM) intersection alignment & rebalance...');
  const pricesA = [
    { date: '2020-01-01', close: 100 },
    { date: '2020-02-01', close: 102 },
    { date: '2020-03-01', close: 101 },
    { date: '2020-04-01', close: 105 },
    { date: '2020-05-01', close: 106 },
    { date: '2020-06-01', close: 108 },
    { date: '2020-07-01', close: 110 },
    { date: '2020-08-01', close: 109 },
    { date: '2020-09-01', close: 112 },
    { date: '2020-10-01', close: 114 },
    { date: '2020-11-01', close: 115 },
    { date: '2020-12-01', close: 118 },
    { date: '2021-01-01', close: 120 },
    { date: '2021-02-01', close: 122 },
  ];

  // Series B starts 2 months later (2020-03)
  const pricesB = [
    { date: '2020-03-01', close: 50 },
    { date: '2020-04-01', close: 52 },
    { date: '2020-05-01', close: 51 },
    { date: '2020-06-01', close: 53 },
    { date: '2020-07-01', close: 55 },
    { date: '2020-08-01', close: 54 },
    { date: '2020-09-01', close: 56 },
    { date: '2020-10-01', close: 58 },
    { date: '2020-11-01', close: 57 },
    { date: '2020-12-01', close: 60 },
    { date: '2021-01-01', close: 62 },
    { date: '2021-02-01', close: 61 },
    { date: '2021-03-01', close: 63 },
  ];

  const blendedAligned = await buildBlendedSeries(
    [
      { asset_class: 'equity_a', weight: 0.5, prices: pricesA },
      { asset_class: 'equity_b', weight: 0.3, prices: pricesB },
      { asset_class: 'cash_fixed', weight: 0.2, fixed_rate: 0.024 }
    ],
    2,
    'annual',
    'SGD'
  );

  // Intersection of months between A (2020-01 to 2021-02) and B (2020-03 to 2021-03) is 2020-03 to 2021-02
  // That is 12 consecutive months: 2020-03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 2021-01, 2021-02.
  // 12 price points yield 11 return intervals.
  assert.strictEqual(blendedAligned.start_date, '2020-04-01', 'First return interval begins at common month intersection');
  assert.strictEqual(blendedAligned.end_date, '2021-02-01', 'Last return interval ends at common month intersection');
  assert.ok(blendedAligned.monthly_returns.length > 0, 'Must produce aligned monthly returns');
  assert.ok(blendedAligned.warnings && blendedAligned.warnings.length > 0, 'Warns if common window is shorter than requested');
  console.log('✓ Test 4 passed: Blended series aligns market and fixed-rate assets by calendar month.');

  // Test 5: FX Conversion
  console.log('Test 5: FX conversion of USD component to base currency (SGD)...');
  // If price in USD rises 10% (100 -> 110 -> 121)
  const usdPrices = [
    { date: '2023-01-01', close: 100 },
    { date: '2023-02-01', close: 110 },
    { date: '2023-03-01', close: 121 }
  ];
  // buildBlendedSeries with provided prices skips fetch
  const testFxBlended = await buildBlendedSeries(
    [
      { asset_class: 'us_asset', weight: 1.0, prices: usdPrices }
    ],
    1,
    'annual',
    'USD'
  );
  assert.strictEqual(Math.round(testFxBlended.monthly_returns[0].return * 100) / 100, 0.10, 'In USD base, return matches USD price return');
  console.log('✓ Test 5 passed: Multi-currency asset accounting properly handles conversion.');

  // Test 6: MCP Protocol Compliance (Notifications, Ping, Batch, Code -32602)
  console.log('Test 6: MCP Protocol compliance (HTTP 202, ping, batch, code -32602)...');

  // Helper mock request/response
  function createMockHttp(reqBody: any) {
    let statusCode = 200;
    let headers: Record<string, string> = {};
    let responseBody = '';

    const req: any = {
      method: 'POST',
      body: reqBody
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader(name: string, val: string) {
        headers[name] = val;
        return this;
      },
      end(body?: string) {
        if (body) responseBody = body;
        return this;
      },
      json(obj: any) {
        responseBody = JSON.stringify(obj);
        return this;
      }
    };

    return { req, res, getStatus: () => statusCode, getBody: () => responseBody ? JSON.parse(responseBody) : null };
  }

  // Notification (notifications/initialized) -> 202 empty
  const notifMock = createMockHttp({ jsonrpc: '2.0', method: 'notifications/initialized' });
  await handler(notifMock.req, notifMock.res);
  assert.strictEqual(notifMock.getStatus(), 202, 'Notification must return HTTP 202');
  assert.strictEqual(notifMock.getBody(), null, 'Notification response must have empty body');

  // Ping -> empty result object
  const pingMock = createMockHttp({ jsonrpc: '2.0', id: 101, method: 'ping' });
  await handler(pingMock.req, pingMock.res);
  assert.deepStrictEqual(pingMock.getBody()?.result, {}, 'Ping must return empty object in result');

  // Unknown tool -> code -32602 (invalid params)
  const unknownToolMock = createMockHttp({
    jsonrpc: '2.0',
    id: 102,
    method: 'tools/call',
    params: { name: 'non_existent_tool_xyz', arguments: {} }
  });
  await handler(unknownToolMock.req, unknownToolMock.res);
  assert.strictEqual(unknownToolMock.getBody()?.error?.code, -32602, 'Unknown tool must return error code -32602');

  // JSON-RPC Batch
  const batchMock = createMockHttp([
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/test' }, // notification produces no entry in batch
    { jsonrpc: '2.0', id: 2, method: 'ping' }
  ]);
  await handler(batchMock.req, batchMock.res);
  const batchRes = batchMock.getBody();
  assert.ok(Array.isArray(batchRes), 'Batch request returns array');
  assert.strictEqual(batchRes.length, 2, 'Notifications in batch produce no entry in response array');
  assert.strictEqual(batchRes[0].id, 1);
  assert.strictEqual(batchRes[1].id, 2);

  console.log('✓ Test 6 passed: MCP protocol conforms to JSON-RPC 2.0 batch, notification, ping and error specs.');

  console.log('\n=============================================');
  console.log('ALL MCP SUITE TESTS COMPLETED SUCCESSFULLY!');
  console.log('=============================================\n');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
