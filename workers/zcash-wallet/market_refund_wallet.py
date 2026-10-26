"""Full-source market refund with separate late market-policy and CANCEL authority."""
import market_native_wallet as kernel
from market_native_protocol import need


class MarketRefundAdapter(kernel.MarketAdapter):
    def commitment(self):
        proof=self.run(self.config['preflightCommand'])
        need(proof.get('cancellationVerified') is True and proof.get('purpose')=='market-refund-v1'
             and proof.get('orderId')==self.request['orderId'] and proof.get('approvedDigest')==self.config['approvedDigest'], 'PERMANENT_CANCEL_AUTHORITY')
        guard=self.run(self.config['authorizationCommand'])
        need(guard.get('authorized') is True and guard.get('orderId')==self.request['orderId']
             and guard.get('approvedDigest')==self.config['approvedDigest'], 'LIVE_MARKET_REFUND_FENCE')


if __name__=='__main__':
    import sys
    kernel.MarketAdapter=MarketRefundAdapter
    try:kernel.main()
    except Exception:
        print('MARKET_REFUND_NATIVE_REFUSED_RECONCILE_ORIGINAL_INTENT',file=sys.stderr);sys.exit(1)
