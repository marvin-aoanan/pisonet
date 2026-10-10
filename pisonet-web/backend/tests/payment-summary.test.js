const assert = require('assert');
const posSalesRouter = require('../routes/pos-sales');
const db = require('../database');

const routeLayer = (posSalesRouter.stack || []).find((layer) => layer.route && layer.route.path === '/payment-summary');
assert(routeLayer, 'Expected /payment-summary route to exist');
const handler = routeLayer.route.stack[0].handle;

const originalAll = db.all;
let responsePayload = null;

try {
  db.all = () => [
    { payment_method: 'cash', payment_status: 'pending', subtotal: 10 },
    { payment_method: 'cash', payment_status: 'approved', subtotal: 12 },
    { payment_method: 'cash', payment_status: 'rejected', subtotal: 5 },
    { payment_method: 'gcash', payment_status: 'approved', subtotal: 7 },
    { payment_method: 'gcash', payment_status: 'pending', subtotal: 9 },
    { payment_method: 'gcash', payment_status: 'rejected', subtotal: 4 },
  ];

  const res = {
    json(payload) {
      responsePayload = payload;
      return payload;
    },
    status(code) {
      return {
        json(payload) {
          responsePayload = payload;
          responsePayload.statusCode = code;
          return payload;
        },
      };
    },
  };

  handler({}, res);

  assert.strictEqual(responsePayload.data.cash_approved, 27, 'Cash totals should include all historical cash sales regardless of approval status');
  assert.strictEqual(responsePayload.data.gcash_pending, 9, 'GCash pending totals should remain unchanged');
  console.log('payment-summary regression test passed');
} finally {
  db.all = originalAll;
}
