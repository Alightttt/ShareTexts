import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  Send, Inbox, Copy, Download, Share2, QrCode, Link2,
  Shield, Zap, Monitor, Smartphone, ChevronRight, ChevronDown,
  Terminal, Key, Clock, RefreshCw, AlertCircle, Check, Lock, ArrowLeft
} from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

type Section = 'overview' | 'transfer' | 'pairing' | 'troubleshooting' | 'privacy' | 'devices' | 'faq' | 'developer' | 'api';

interface NavItem {
  id: Section;
  label: string;
  icon: React.ReactNode;
  group?: 'user' | 'developer';
}

const NAV_ITEMS: NavItem[] = [
  // ── User Documentation ──────────────────────────────────────
  { id: 'overview', label: 'Getting Started', icon: <Monitor className="w-4 h-4" />, group: 'user' },
  { id: 'transfer', label: 'How to Transfer', icon: <Send className="w-4 h-4" />, group: 'user' },
  { id: 'pairing', label: 'Pairing & QR', icon: <QrCode className="w-4 h-4" />, group: 'user' },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: <RefreshCw className="w-4 h-4" />, group: 'user' },
  { id: 'privacy', label: 'Privacy & Security', icon: <Shield className="w-4 h-4" />, group: 'user' },
  { id: 'devices', label: 'Supported Devices', icon: <Smartphone className="w-4 h-4" />, group: 'user' },
  { id: 'faq', label: 'FAQ', icon: <AlertCircle className="w-4 h-4" />, group: 'user' },
  // ── Developer Documentation ─────────────────────────────────
  { id: 'developer', label: 'Developer Guide', icon: <Terminal className="w-4 h-4" />, group: 'developer' },
  { id: 'api', label: 'API Reference', icon: <Key className="w-4 h-4" />, group: 'developer' },
];

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-[12px] bg-gray-900 dark:bg-gray-950 border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="text-[12px] font-medium text-gray-400">{language}</span>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          className="text-[12px] text-gray-400 hover:text-white transition-colors"
        >
          Copy
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-gray-300 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StepCard({ number, title, description, icon }: { number: number; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="shrink-0 w-10 h-10 rounded-full bg-[#9d92f7]/10 dark:bg-[#a89cf7]/10 flex items-center justify-center">
        <span className="text-[14px] font-semibold text-[#9d92f7] dark:text-[#a89cf7]">{number}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white">{title}</h3>
        </div>
        <p className="text-[14px] text-apple-ink-muted dark:text-white/60 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-1">ShareText</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-lg">
          AirDrop for any device. Move text, photos, and files between your devices. No app, no account, nothing kept.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { icon: <Zap className="w-5 h-5" />, title: 'Instant', desc: 'Direct device-to-device. No cloud.' },
          { icon: <Shield className="w-5 h-5" />, title: 'Private', desc: 'Encrypted. Temporary. Gone when you close the tab.' },
          { icon: <Monitor className="w-5 h-5" />, title: 'Universal', desc: 'Any browser, any device. No install.' },
          { icon: <Lock className="w-5 h-5" />, title: 'Verified', desc: 'SHA-256 on every transfer. Bit-perfect.' },
        ].map((f, i) => (
          <div key={i} className="flex gap-3.5 p-4 rounded-[14px] bg-white dark:bg-apple-tile-1 border border-apple-divider/50 dark:border-apple-tile-3">
            <div className="w-10 h-10 rounded-full bg-[#9d92f7]/10 dark:bg-[#a89cf7]/10 flex items-center justify-center shrink-0 text-[#9d92f7] dark:text-[#a89cf7]">{f.icon}</div>
            <div>
              <p className="text-[14px] font-semibold text-apple-ink dark:text-white mb-0.5">{f.title}</p>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/55 leading-snug">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransferSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-1">How it works</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60">Three steps. Ten seconds.</p>
      </div>

      <div className="space-y-4">
        {[
          { n: '1', title: 'Open on both devices', desc: 'Go to sharetexts.online on both.' },
          { n: '2', title: 'Connect', desc: 'Tap Send on one, Receive on the other. Enter the 6-digit code.' },
          { n: '3', title: 'Transfer', desc: 'Type, paste, or attach. It appears instantly on the other device.' },
        ].map((s, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="shrink-0 w-9 h-9 rounded-full bg-[#9d92f7]/10 dark:bg-[#a89cf7]/10 flex items-center justify-center">
              <span className="text-[14px] font-bold text-[#9d92f7] dark:text-[#a89cf7]">{s.n}</span>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-0.5">{s.title}</h3>
              <p className="text-[14px] text-apple-ink-muted dark:text-white/60">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {['Text', 'Links', 'Photos', 'Files'].map((t) => (
          <span key={t} className="px-3 py-1.5 rounded-full bg-[#9d92f7]/8 dark:bg-[#9d92f7]/10 text-[13px] font-medium text-[#9d92f7] dark:text-[#a89cf7]">{t}</span>
        ))}
      </div>
    </div>
  );
}

function PairingSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">Pairing & QR</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-2xl">
          ShareText uses a 6-digit pairing code to connect two devices. The code refreshes automatically and expires after a short time for security.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white">How pairing works</h3>
        <div className="space-y-3 text-[15px] text-apple-ink-muted dark:text-white/60 leading-relaxed">
          <p><strong className="text-apple-ink dark:text-white">Sender:</strong> Click 'Send something' to create a room. You'll see a 6-digit code and a QR code.</p>
          <p><strong className="text-apple-ink dark:text-white">Receiver:</strong> Click 'Receive something' and enter the 6-digit code, or scan the QR code with your camera.</p>
          <p>Once both devices are connected, the pairing screen is replaced by the transfer workspace.</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white">QR code</h3>
        <div className="space-y-3 text-[15px] text-apple-ink-muted dark:text-white/60 leading-relaxed">
          <p>The QR code contains the pairing link. Scan it with the other device's camera to connect automatically.</p>
          <p>If the QR code doesn't scan, you can always type the 6-digit code manually.</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white">Code expiry</h3>
        <div className="space-y-3 text-[15px] text-apple-ink-muted dark:text-white/60 leading-relaxed">
          <p>The pairing code refreshes automatically. If it expires before the other device connects, a new code is generated.</p>
          <p>Share link: You can also share the room link directly. The receiver opens the link and connects automatically.</p>
        </div>
      </div>
    </div>
  );
}

function TroubleshootingSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">Troubleshooting</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-2xl">
          Most issues resolve by checking your internet connection and trying again.
        </p>
      </div>

      <div className="space-y-6">
        {[
          { problem: "Can't create a room", solution: "Check your internet connection. If the problem persists, the service may be temporarily unavailable — try again in a moment." },
          { problem: 'Code expired', solution: 'The pairing code refreshes automatically. If the other device can\'t connect in time, create a new room to get a fresh code.' },
          { problem: "Code doesn't work", solution: 'Make sure you\'re entering the correct 6-digit code from the other device. Codes are case-sensitive and must be entered exactly.' },
          { problem: 'QR code won\'t scan', solution: 'Make sure the camera has permission. If scanning still fails, type the 6-digit code manually instead.' },
          { problem: 'Connection dropped', solution: 'The other device may have closed their tab or lost internet. On the sending device, a new pairing code is available to reconnect.' },
          { problem: 'Transfer failed', solution: 'The connection was interrupted. Tap Retry to send again. The file was not marked as complete.' },
          { problem: 'File won\'t download', solution: 'Check that your browser allows downloads. On mobile, try long-pressing the file and selecting Save.' },
        ].map((item, i) => (
          <div key={i} className="p-5 rounded-[16px] bg-white dark:bg-surface-dark border border-apple-divider/50 dark:border-apple-tile-3">
            <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2">{item.problem}</h3>
            <p className="text-[14px] text-apple-ink-muted dark:text-white/60 leading-relaxed">{item.solution}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivacySection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-1">Privacy & Security</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-lg">
          Your data moves directly between devices. Nothing stored.
        </p>
      </div>

      <div className="space-y-3">
        {[
          { icon: <Lock className="w-4 h-4" />, title: 'Encrypted end-to-end', desc: 'DTLS + app-level encryption. ShareText never sees your content.' },
          { icon: <Shield className="w-4 h-4" />, title: 'No accounts, no history', desc: 'No sign-up, no cloud, no tracking. Close the tab, it is gone.' },
          { icon: <Clock className="w-4 h-4" />, title: 'Temporary rooms', desc: 'Rooms expire automatically. Your data is never stored long-term.' },
          { icon: <Check className="w-4 h-4" />, title: 'Verified transfers', desc: 'SHA-256 on every transfer. What you send is exactly what arrives.' },
        ].map((item, i) => (
          <div key={i} className="flex gap-3.5 p-4 rounded-[14px] bg-white dark:bg-apple-tile-1 border border-apple-divider/50 dark:border-apple-tile-3">
            <div className="text-status-success shrink-0 mt-0.5">{item.icon}</div>
            <div>
              <p className="text-[14px] font-semibold text-apple-ink dark:text-white mb-0.5">{item.title}</p>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/55 leading-snug">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DevicesSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">Supported Devices</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-2xl">
          ShareText works in any modern browser. No app installation required.
        </p>
      </div>

      <div className="space-y-6">
        <div className="p-5 rounded-[16px] bg-white dark:bg-surface-dark border border-apple-divider/50 dark:border-apple-tile-3">
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-3">Browsers</h3>
          <div className="grid grid-cols-2 gap-3">
            {['Chrome', 'Safari', 'Firefox', 'Edge'].map((b) => (
              <div key={b} className="flex items-center gap-2 text-[14px] text-apple-ink-muted dark:text-white/60">
                <Check className="w-4 h-4 text-status-success" />{b}
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 rounded-[16px] bg-white dark:bg-surface-dark border border-apple-divider/50 dark:border-apple-tile-3">
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-3">Operating Systems</h3>
          <div className="grid grid-cols-2 gap-3">
            {['iOS / iPadOS', 'Android', 'Windows', 'macOS', 'Linux', 'ChromeOS'].map((os) => (
              <div key={os} className="flex items-center gap-2 text-[14px] text-apple-ink-muted dark:text-white/60">
                <Check className="w-4 h-4 text-status-success" />{os}
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 rounded-[16px] bg-apple-parchment dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2">Requirements</h3>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60 leading-relaxed">Both devices need an internet connection and a browser that supports WebRTC. No special permissions are required for text transfers. Camera permission is needed for QR scanning.</p>
        </div>
      </div>
    </div>
  );
}

function AgentSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">
          For AI Agents
        </h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-2xl">
          ShareText supports programmatic access for trusted tools. Send text or files into an active room
          using the temporary agent send permission.
        </p>
      </div>

      <div className="p-5 rounded-[16px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[15px] font-semibold text-amber-800 dark:text-amber-200 mb-1">Security Notice</h3>
            <p className="text-[14px] text-amber-700 dark:text-amber-300">
              The agent send permission is a temporary, room-scoped token. It expires automatically and can be revoked.
              Never share this token publicly or store it in logs.
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white mb-4">Getting the Agent Token</h3>
        <ol className="space-y-3 text-[14px] text-apple-ink-muted dark:text-white/60">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-azure-600/10 flex items-center justify-center text-[12px] font-semibold text-[#9d92f7]">1</span>
            <span>Open ShareText and create a room (click "Send")</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-azure-600/10 flex items-center justify-center text-[12px] font-semibold text-[#9d92f7]">2</span>
            <span>Click the <Terminal className="w-4 h-4 inline" /> icon in the header to open the agent panel</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-azure-600/10 flex items-center justify-center text-[12px] font-semibold text-[#9d92f7]">3</span>
            <span>Copy the curl command or use the token directly</span>
          </li>
        </ol>
      </div>

      <div>
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white mb-4">Send Text</h3>
        <CodeBlock
          language="bash"
          code={`curl -X POST https://sharetexts.online/api/push \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"roomId":"ROOM_ID","text":"Hello from my computer"}'`}
        />
      </div>

      <div>
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white mb-4">Send File</h3>
        <CodeBlock
          language="bash"
          code={`curl -X POST https://sharetexts.online/api/push?roomId=ROOM_ID \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/octet-stream" \\
  -H "X-File-Name: notes.txt" \\
  --data-binary @notes.txt`}
        />
      </div>

      <div>
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white mb-4">Response Format</h3>
        <CodeBlock
          language="json"
          code={`{
  "success": true,
  "messageId": "msg_abc123"
}`}
        />
      </div>
    </div>
  );
}

function APISection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">
          API Reference
        </h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-2xl">
          ShareText exposes a minimal REST API for agent integration.
        </p>
      </div>

      <div className="space-y-6">
        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <div className="flex items-center gap-3 mb-3">
            <span className="px-2 py-0.5 rounded-[4px] bg-green-100 dark:bg-green-900/30 text-[12px] font-semibold text-green-700 dark:text-green-400">POST</span>
            <code className="text-[14px] font-mono text-apple-ink dark:text-white">/api/push</code>
          </div>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60 mb-4">
            Send text or a file to an active room.
          </p>
          <div className="space-y-3">
            <div>
              <h4 className="text-[13px] font-semibold text-apple-ink dark:text-white mb-2">Headers</h4>
              <div className="space-y-1 text-[13px] font-mono text-apple-ink-muted dark:text-white/60">
                <div><span className="text-[#9d92f7]">Authorization:</span> Bearer {'<token>'}</div>
                <div><span className="text-[#9d92f7]">Content-Type:</span> application/json or application/octet-stream</div>
                <div><span className="text-[#9d92f7]">X-File-Name:</span> (optional) filename for file transfers</div>
              </div>
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-apple-ink dark:text-white mb-2">Body (JSON)</h4>
              <div className="space-y-1 text-[13px] font-mono text-apple-ink-muted dark:text-white/60">
                <div><span className="text-[#9d92f7]">roomId:</span> string (required)</div>
                <div><span className="text-[#9d92f7]">text:</span> string (for text transfers)</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <div className="flex items-center gap-3 mb-3">
            <span className="px-2 py-0.5 rounded-[4px] bg-blue-100 dark:bg-blue-900/30 text-[12px] font-semibold text-blue-700 dark:text-blue-400">GET</span>
            <code className="text-[14px] font-mono text-apple-ink dark:text-white">/health</code>
          </div>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60">
            Health check endpoint. Returns server status.
          </p>
        </div>

        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <div className="flex items-center gap-3 mb-3">
            <span className="px-2 py-0.5 rounded-[4px] bg-blue-100 dark:bg-blue-900/30 text-[12px] font-semibold text-blue-700 dark:text-blue-400">GET</span>
            <code className="text-[14px] font-mono text-apple-ink dark:text-white">/stats</code>
          </div>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60">
            Returns approximate live user count. No room-level information.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white mb-4">Error Responses</h3>
        <div className="space-y-2">
          {[
            { code: '401', message: 'Invalid or expired token' },
            { code: '403', message: 'Origin not allowed' },
            { code: '404', message: 'Room not found' },
            { code: '429', message: 'Rate limited' },
            { code: '500', message: 'Server error' },
          ].map((err) => (
            <div key={err.code} className="flex items-center gap-3 text-[14px]">
              <code className="px-2 py-0.5 rounded-[4px] bg-red-100 dark:bg-red-900/30 text-[12px] font-mono text-red-700 dark:text-red-400">{err.code}</code>
              <span className="text-apple-ink-muted dark:text-white/60">{err.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SecuritySection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">
          Security
        </h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-2xl">
          ShareText is designed with privacy and security as core principles.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">            <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2 flex items-center gap-2">
            <Lock className="w-4 h-4 text-status-success" />
            Encrypted in the browser
          </h3>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60">
            Transfer content is encrypted between devices. ShareText is designed for temporary handoffs, not permanent storage.
          </p>
        </div>

        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-status-success" />
            Temporary by Design
          </h3>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60">
            Rooms expire automatically. No accounts, no permanent history, no cloud storage.
          </p>
        </div>

        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-status-success" />
            Verified Transfers
          </h3>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60">
            Every file transfer is verified with SHA-256. What you send is exactly what arrives.
          </p>
        </div>

        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-status-warning" />
            Agent Tokens
          </h3>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60">
            Agent send permissions are temporary, room-scoped, and can be revoked. They expire automatically.
          </p>
        </div>
      </div>

      <div className="p-5 rounded-[16px] bg-apple-parchment dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
        <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-3">What ShareText does NOT store</h3>
        <ul className="space-y-2 text-[14px] text-apple-ink-muted dark:text-white/60">
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
            Your files or text content
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
            Your account information (there are no accounts)
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
            Transfer history after the session ends
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
            IP addresses for analytics
          </li>
        </ul>
      </div>
    </div>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: 'What is ShareText?',
      a: 'ShareText is a temporary bridge between two devices. Move text, links, photos, videos, and files directly from one screen to another. No app, no account, nothing kept.'
    },
    {
      q: 'Is it free?',
      a: 'Yes. ShareText is completely free to use.'
    },
    {
      q: 'Is it private?',
      a: 'Yes. Transfers are encrypted between devices. ShareText does not store your files, text, or transfer history.'
    },
    {
      q: 'What if my internet drops mid-transfer?',
      a: 'If the connection is interrupted, ShareText will tell you whether the transfer can be retried. For large files, we recommend a stable connection.'
    },
    {
      q: 'How long does the pairing code last?',       a: 'The code refreshes every 90 seconds. If it expires, a new one appears automatically.'
    },
    {
      q: 'Can an AI agent send text into my room?',
      a: 'Yes. The connect screen offers a temporary send permission for trusted tools. It expires automatically and can be revoked anytime.'
    },
    {
      q: 'What file types are supported?',
      a: 'Any file type. ShareText transfers the original bytes without conversion. Images, videos, audio, documents, archives, code, and more.'
    },
    {
      q: 'Is there a file size limit?',
      a: 'ShareText has been tested with large files. Actual limits depend on your browser, device memory, and network stability. For very large files, a stable connection is recommended.'
    },
    {
      q: 'Does it work on mobile?',
      a: 'Yes. ShareText works in any modern mobile browser. No app download required.'
    },
    {
      q: 'Can I transfer between iPhone and Android?',
      a: 'Yes. ShareText works across all platforms and devices with a modern browser.'
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">
          Frequently Asked Questions
        </h2>
      </div>

      <div className="space-y-2">
        {faqs.map((faq, i) => (
          <div
            key={i}
            className="rounded-[12px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 overflow-hidden"
          >
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <span className="text-[15px] font-medium text-apple-ink dark:text-white">{faq.q}</span>
              {openIndex === i ? (
                <ChevronDown className="w-4 h-4 text-apple-ink-muted shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-apple-ink-muted shrink-0" />
              )}
            </button>
            {openIndex === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pb-4"
              >
                <p className="text-[14px] text-apple-ink-muted dark:text-white/60 leading-relaxed">{faq.a}</p>
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Docs() {
  const [activeSection, setActiveSection] = useState<Section>('overview');

  const renderSection = () => {
    switch (activeSection) {
      case 'overview': return <OverviewSection />;
      case 'transfer': return <TransferSection />;
      case 'pairing': return <PairingSection />;
      case 'troubleshooting': return <TroubleshootingSection />;
      case 'privacy': return <PrivacySection />;
      case 'devices': return <DevicesSection />;
      case 'faq': return <FAQSection />;
      case 'developer': return <AgentSection />;
      case 'api': return <APISection />;
    }
  };

  return (
    <div className="min-h-screen bg-apple-canvas dark:bg-night-900 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-md border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <a href="/" className="flex items-center gap-2 shrink-0" aria-label="ShareText — back to home">
            <ArrowLeft className="w-4 h-4 text-apple-ink-muted dark:text-white/60" />
            <ShareTextLogo size={21} className="text-apple-ink dark:text-white" />
            <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
          </a>
          <div className="flex items-center gap-4 ml-auto">
            <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60">Docs</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar Navigation — desktop only */}
        <nav className="hidden md:block w-48 shrink-0">
          <div className="sticky top-24 space-y-4">
            {/* User Documentation */}
            <div>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-apple-ink-muted/50 dark:text-white/30">User Guide</p>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter(i => i.group === 'user').map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[14px] font-medium transition-colors ${
                      activeSection === item.id
                        ? 'bg-azure-600/10 text-[#9d92f7] dark:text-[#a89cf7]'
                        : 'text-apple-ink-muted dark:text-white/60 hover:bg-apple-parchment dark:hover:bg-apple-tile-1'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Developer Documentation */}
            <div>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-apple-ink-muted/50 dark:text-white/30">Developer</p>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter(i => i.group === 'developer').map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[14px] font-medium transition-colors ${
                      activeSection === item.id
                        ? 'bg-azure-600/10 text-[#9d92f7] dark:text-[#a89cf7]'
                        : 'text-apple-ink-muted dark:text-white/60 hover:bg-apple-parchment dark:hover:bg-apple-tile-1'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 min-w-0 pb-20 md:pb-8">
          {/* Mobile Navigation — horizontal scrollable pills at top of content */}
          <div className="md:hidden -mx-6 px-6 mb-6 overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2 min-w-max">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                    activeSection === item.id
                      ? 'bg-[#9d92f7] text-white shadow-sm'
                      : 'bg-apple-parchment dark:bg-apple-tile-2 text-apple-ink-muted dark:text-white/60'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
