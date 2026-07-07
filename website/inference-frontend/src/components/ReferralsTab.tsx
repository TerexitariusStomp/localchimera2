import { Users, CheckCircle, ArrowUpRight } from 'lucide-react';

const REFREF_URL = import.meta.env.VITE_REFREF_URL || 'https://github.com/amicalhq/refref';

export default function ReferralsTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-6 text-slate-800">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Referrals</h2>
        <p className="text-sm text-slate-500 mb-4">
          Chimera uses the upstream RefRef instance for referral tracking. Open the deployed instance below.
        </p>
        <a
          href={REFREF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#111111] text-white text-[13px] font-semibold hover:opacity-85"
        >
          <ArrowUpRight className="h-4 w-4" /> Open RefRef
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5 text-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-full bg-[#f0f9ff] p-2">
              <Users className="h-5 w-5 text-[#00e5ff]" />
            </div>
            <h3 className="font-semibold text-slate-800">Invite friends</h3>
          </div>
          <p className="text-xs text-slate-500">Share your referral link and earn rewards when friends join.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 text-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-full bg-green-50 p-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <h3 className="font-semibold text-slate-800">Track qualified referrals</h3>
          </div>
          <p className="text-xs text-slate-500">Monitor sign-ups, qualified referrals, and reward progress.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 text-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-full bg-purple-50 p-2">
              <ArrowUpRight className="h-5 w-5 text-[#a855f7]" />
            </div>
            <h3 className="font-semibold text-slate-800">Level up rewards</h3>
          </div>
          <p className="text-xs text-slate-500">Climb referral tiers and unlock higher monthly bonuses.</p>
        </div>
      </div>
    </div>
  );
}
