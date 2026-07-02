import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Users,
  CheckCircle,
  Clock,
  Wallet,
  TrendingUp,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { Button, Input } from './ui';
import { getReferralSummary, applyReferralCode } from '../api/stats';
import type { ReferralAccount } from '../types';
import { cn } from '../lib/utils';

const LEVELS = [1, 5, 10, 25, 50];

export default function ReferralsTab({ accountHash }: { accountHash?: string }) {
  const [data, setData] = useState<ReferralAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await getReferralSummary(accountHash);
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountHash]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !accountHash) return;
    setApplyLoading(true);
    try {
      const res = await applyReferralCode(accountHash, code.trim());
      setData(res.account);
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplyLoading(false);
    }
  };

  const copyLink = async () => {
    if (!data) return;
    const url = `${window.location.origin}/?ref=${data.inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const shareX = () => {
    if (!data) return;
    const text = `Join Chimera decentralized inference and earn rewards! Use my referral code ${data.inviteCode}`;
    const url = `${window.location.origin}/?ref=${data.inviteCode}`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank'
    );
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading referrals...</div>;
  }
  if (!data) return null;

  const progressDenominator =
    data.referralsNeeded > 0 ? data.qualifiedReferrals + data.referralsNeeded : data.qualifiedReferrals || 1;
  const progressPct = Math.min((data.qualifiedReferrals / progressDenominator) * 100, 100);

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5 text-[#00e5ff]" />}
          iconBg="bg-[#f0f9ff]"
          label="Total Referrals"
          value={`${data.totalReferrals} people`}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          iconBg="bg-green-50"
          label="Qualified Referrals"
          value={`${data.qualifiedReferrals} people`}
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          iconBg="bg-amber-50"
          label="Pending Referrals"
          value={`${data.pendingReferrals} people`}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5 text-[#a855f7]" />}
          iconBg="bg-purple-50"
          label="Lifetime Reward"
          value={`${data.lifetimeReward} MYST`}
        />
      </div>

      {/* Referrals needed / progress */}
      <div className="bg-white rounded-2xl shadow-sm p-5 text-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#00e5ff]" />
            Referrals Needed
          </div>
          <div className="text-xs font-semibold text-[#00e5ff]">Level {data.level}</div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-3xl font-bold text-slate-800">{data.referralsNeeded > 0 ? data.referralsNeeded : 0}</span>
          <span className="text-xs text-slate-500">to the next level</span>
        </div>

        <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden mb-4">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#00e5ff] to-[#a855f7] rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="grid grid-cols-5 gap-2 text-center text-[10px] text-slate-400">
          {LEVELS.map((threshold, idx) => {
            const active = data.level >= idx + 1;
            return (
              <div key={idx} className="flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? 'bg-[#00e5ff] text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {idx + 1}
                </div>
                <span className={active ? 'text-slate-800 font-medium' : ''}>
                  {threshold}
                  {idx === LEVELS.length - 1 ? '+' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Get to action */}
      <div>
        <h3 className="text-lg font-semibold text-slate-100 mb-3">Get to action</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 text-slate-800">
              <div className="flex items-start justify-between mb-1">
                <h4 className="font-semibold">Share the referral link</h4>
                <button onClick={shareX} className="text-xs text-[#00e5ff] hover:underline flex items-center gap-1">
                  <X className="h-3 w-3" /> Share on X
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                You can share your referral link by copying and sharing with your friends, or via social media.
              </p>
              <div className="flex gap-2">
                <Input
                  value={`${window.location.origin}/?ref=${data.inviteCode}`}
                  onChange={() => {}}
                  placeholder=""
                  className="flex-1"
                  variant="light"
                  readOnly
                />
                <Button onClick={copyLink} variant="pink" className="px-4">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-1">Copy</span>
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 text-slate-800">
              <h4 className="font-semibold mb-1">Do you have a invitation code?</h4>
              <p className="text-xs text-slate-500 mb-3">
                Insert your invitation code here to earn more MYST and more rewards.
              </p>
              <form onSubmit={handleApply} className="flex gap-2">
                <Input
                  value={code}
                  onChange={setCode}
                  placeholder="Enter referral code here"
                  className="flex-1"
                  variant="light"
                  disabled={applyLoading || !accountHash}
                />
                <Button type="submit" variant="pink" disabled={!accountHash || !code.trim() || applyLoading} className="px-4">
                  Apply
                </Button>
              </form>
            </div>
          </div>

          {/* Invite friends gradient card */}
          <div className="bg-gradient-to-br from-[#e0f2fe] to-[#f3e8ff] rounded-2xl shadow-sm p-6 relative overflow-hidden text-slate-800">
            <div className="relative z-10">
              <h4 className="text-xl font-medium mb-1">Invite friends</h4>
              <p className="text-3xl font-bold mb-1">
                Get <span className="bg-gradient-to-r from-[#00e5ff] to-[#a855f7] bg-clip-text text-transparent">MYST</span>
              </p>
              <ul className="space-y-2 text-xs text-slate-600 mt-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#00e5ff]">›</span>
                  Invite friends, get up to <strong>5%</strong> every month based on your qualified referrals.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#00e5ff]">›</span>
                  Your invitee gets a <strong>5% bonus</strong> in their first month.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#00e5ff]">›</span>
                  Your referral becomes qualified after <strong>14 days</strong> of uptime in a month.
                </li>
              </ul>
            </div>
            <PhoneMockup />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StepCard
          number={1}
          title="Share the Referral code"
          desc="Spread a word! Invite your friends with referral code and earn extra MYST."
        />
        <StepCard
          number={2}
          title="Level up your score"
          desc="Invite more friends to level up your score! Unlock 5 levels, each with increasing bonus rewards."
        />
        <StepCard
          number={3}
          title="Increase your earnings"
          desc="Keep a track of your earnings, invite more friends and earn more rewards. Reward transferred monthly."
        />
        <StepCard
          number={4}
          title="Track your progress"
          desc="Qualified and pending referral scores reset monthly, but your total invited referrals remain. Referrals qualify after 14 days of uptime."
        />
      </div>
    </div>
  );
}

function StatCard({ icon, iconBg, label, value }: { icon: ReactNode; iconBg: string; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn('rounded-full p-2', iconBg)}>{icon}</div>
        <div className="text-xs font-medium text-slate-500">{label}</div>
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
    </div>
  );
}

function StepCard({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 flex gap-4">
      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-800">
        {number}
      </div>
      <div>
        <div className="font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <svg className="absolute right-2 bottom-2 h-36 w-auto opacity-90" viewBox="0 0 120 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="100" height="220" rx="18" fill="white" stroke="#e2e8f0" strokeWidth="2"/>
      <rect x="18" y="30" width="84" height="180" rx="8" fill="#f8fafc"/>
      <circle cx="60" cy="225" r="6" fill="#e2e8f0"/>
      <circle cx="60" cy="60" r="14" fill="#e0f2fe"/>
      <text x="60" y="65" textAnchor="middle" fontSize="12" fill="#00e5ff" fontWeight="bold">$</text>
    </svg>
  );
}
