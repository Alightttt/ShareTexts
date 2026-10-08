import React, { useState, useEffect } from 'react';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { PageHeader } from '../components/PageHeader';
import { ThemeToggle } from '../components/ThemeToggle';
import { FaqSection } from '../components/marketing/FaqSection';
import { DataFlow } from '../components/marketing/DataFlow';
import { IsometricShareIllustration } from '../components/isometric/IsometricIllustrations';
import { PlatformStrip } from '../components/marketing/PlatformStrip';
import { SiteFooter } from '../components/marketing/SiteFooter';
import { useI18n } from '../lib/i18n';
// Gravity UI icons aliased onto the names this file already uses.
import {
  PaperPlane as Send, ArrowDownToLine as Inbox, Copy, ArrowDownToLine as Download,
  ArrowUpFromSquare as Share2, QrCode, Link as Link2, Shield, Thunderbolt as Zap,
  Display as Monitor, Smartphone, Terminal, Key, Clock,
  ArrowRotateRight as RefreshCw, CircleExclamation as AlertCircle, Check, Lock,
  ArrowLeft, Signal as Radio,
} from '@gravity-ui/icons';

const EASE = [0.16, 1, 0.3, 1] as const;

type Section = 'overview' | 'transfer' | 'pairing' | 'nearby' | 'troubleshooting' | 'privacy' | 'devices' | 'faq' | 'developer' | 'api';

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
  { id: 'nearby', label: 'Nearby Devices', icon: <Radio className="w-4 h-4" />, group: 'user' },
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
    <div className="relative rounded-[12px] bg-night-800 dark:bg-night-950 border border-white/[0.08] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.08]">
        <span className="text-[12px] font-medium text-white/40">{language}</span>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          className="text-[12px] text-white/40 hover:text-white/80 transition-colors"
        >
          Copy
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-white/70 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StepCard({ number, title, description, icon }: { number: number; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="shrink-0 w-10 h-10 rounded-full bg-ember/10 dark:bg-azure-400/10 flex items-center justify-center">
        <span className="text-[14px] font-semibold text-ember dark:text-azure-400">{number}</span>
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
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-1">ShareTexts</h1>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-lg">
          Like AirDrop, but it works between any two devices, even an iPhone and a Windows PC. Send text, photos, or files from a browser. Nothing is kept once the room closes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">        {[
          { icon: <Zap className="w-5 h-5" />, title: 'Instant', desc: 'Direct device-to-device. No cloud.' },
          { icon: <Shield className="w-5 h-5" />, title: 'Private', desc: 'Encrypted. Temporary. Gone when you close the tab.' },
          { icon: <Monitor className="w-5 h-5" />, title: 'Universal', desc: 'Any browser, any device. No install.' },
          { icon: <Lock className="w-5 h-5" />, title: 'Verified', desc: 'SHA-256 on every transfer. Bit-perfect.' },
        ].map((f, i) => (
          <div key={i} className="flex gap-3.5 p-4 rounded-[14px] bg-white dark:bg-apple-tile-1 border border-apple-divider/50 dark:border-apple-tile-3">
            <div className="w-10 h-10 rounded-full bg-ember/10 dark:bg-azure-400/10 flex items-center justify-center shrink-0 text-ember dark:text-azure-400">{f.icon}</div>
            <div>
              <p className="text-[14px] font-semibold text-apple-ink dark:text-white mb-0.5">{f.title}</p>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/55 leading-snug">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* The flagship isometric view of the product's one spatial idea:
          two devices, one desk, a direct wire, an object mid-flight. It
          carries the "no clouds, no relays" story in geometry, before a
          word of DataFlow is read. */}
      <figure className="m-0" data-testid="docs-iso-share">
        <IsometricShareIllustration
          className="mx-auto w-full max-w-[520px]"
          label="Isometric drawing: a laptop and a phone on one desk, a direct connection drawn between them, a file crossing it."
        />
      </figure>

      {/* What actually happens to the bytes — the one misconception worth
          correcting with a picture ("it goes through your servers"). */}
      <DataFlow />

      <PlatformStrip />
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
          { n: '2', title: 'Connect', desc: 'Tap Send on one device, Receive on the other. Enter the 6-digit code — or, if the other device is nearby and open, just tap it under Nearby devices.' },
          { n: '3', title: 'Transfer', desc: 'Type, paste, or attach. It appears instantly on the other device.' },
        ].map((s, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="shrink-0 w-9 h-9 rounded-full bg-ember/10 dark:bg-azure-400/10 flex items-center justify-center">
              <span className="text-[14px] font-bold text-ember dark:text-azure-400">{s.n}</span>
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
          <span key={t} className="px-3 py-1.5 rounded-full bg-ember/8 dark:bg-ember/10 text-[13px] font-medium text-ember dark:text-azure-400">{t}</span>
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
          ShareTexts uses a 6-digit pairing code to connect two devices. The code refreshes automatically and expires after a short time for security.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white">How pairing works</h3>
        <div className="space-y-3 text-[15px] text-apple-ink-muted dark:text-white/60 leading-relaxed">
          <p><strong className="text-apple-ink dark:text-white">Sender:</strong> Click <strong>Send</strong> to create a room. You'll see a 6-digit code and a QR code.</p>
          <p><strong className="text-apple-ink dark:text-white">Receiver:</strong> Click <strong>Receive</strong> and enter the 6-digit code, or scan the QR code with your camera.</p>
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



function NearbySection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">Nearby Devices</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-2xl">
          Open ShareTexts on another device. If both devices are on the same supported local network, the other device can appear automatically — tap it to start a transfer.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white">How it works</h3>
        <div className="space-y-3 text-[15px] text-apple-ink-muted dark:text-white/60 leading-relaxed">
          <p><strong className="text-apple-ink dark:text-white">Open ShareTexts on both devices.</strong> When another ShareTexts device is nearby and idle, it appears under the Send and Receive buttons on your home screen.</p>
          <p><strong className="text-apple-ink dark:text-white">Tap the device.</strong> The other device gets an invitation and must accept. Once accepted, the connection is established exactly like any other ShareTexts connection.</p>
          <p>Prefer a code? The 6-digit code, QR code, and share link always remain available as alternative methods.</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white">Privacy</h3>
        <div className="space-y-3 text-[15px] text-apple-ink-muted dark:text-white/60 leading-relaxed">
          <p>Nearby discovery is <strong className="text-apple-ink dark:text-white">not a global device list</strong>. A device is only visible while ShareTexts is open on it, and presence expires automatically within about a minute of the tab closing. Devices are not Bluetooth scans, and nothing is broadcast over your local network.</p>
          <p>Other devices only ever see a temporary label such as "Windows PC" or "iPhone". No IP addresses, account information, or permanent identifiers are shared. A device that is already connected to a room is not listed.</p>
          <p>Discovery only identifies a candidate device. Selecting one sends an invitation, and the actual connection always uses the same secure end-to-end encrypted channel as code, QR, and link connections.</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white">Limits</h3>
        <div className="space-y-3 text-[15px] text-apple-ink-muted dark:text-white/60 leading-relaxed">
          <p>Nearby discovery works between devices that reach the same ShareTexts signaling service. Two devices on completely different networks (for example, separate mobile carriers) will not see each other — use the code, QR, or share link instead.</p>
          <p>This feature requires the standard signaling deployment. It is not available on every hosting configuration; when unavailable, the home screen simply shows the hint line without a device list, and every other method works unchanged.</p>
        </div>
      </div>
    </div>
  );
}

function TroubleshootingSection() {  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4">Troubleshooting</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-2xl">
          Most issues resolve by checking your internet connection and trying again.
        </p>
      </div>

      <div className="space-y-6">
        {[
          { problem: "Can't create a room", solution: "Check your internet connection. If the problem persists, the service may be temporarily unavailable. Try again in a moment." },
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
          { icon: <Lock className="w-4 h-4" />, title: 'Encrypted end-to-end', desc: 'DTLS + app-level encryption. ShareTexts never sees your content.' },
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
          ShareTexts works in any modern browser. No app installation required.
        </p>
      </div>

      <div className="space-y-6">
        <div className="p-5 rounded-[16px] bg-white dark:bg-surface-dark border border-apple-divider/50 dark:border-apple-tile-3">
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-3">Browsers</h3>
          <div className="grid grid-cols-2 gap-3">
            {['Chrome', 'Safari', 'Firefox', 'Edge', 'Brave', 'Arc', 'Samsung Internet', 'Opera / Vivaldi'].map((b) => (
              <div key={b} className="flex items-center gap-2 text-[14px] text-apple-ink-muted dark:text-white/60">
                <Check className="w-4 h-4 text-status-success" />{b}
              </div>
            ))}
          </div>
          <p className="text-[13px] text-apple-ink-muted dark:text-white/50 leading-relaxed mt-3">
            Tor Browser works when WebRTC is enabled. If a browser can't run ShareTexts, you'll see a clear explanation instead of a broken page.
          </p>
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
          ShareTexts supports programmatic access for trusted tools. Send text or files into an active room
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
            <span className="shrink-0 w-6 h-6 rounded-full bg-azure-600/10 flex items-center justify-center text-[12px] font-semibold text-ember">1</span>
            <span>Open ShareTexts and create a room (click "Send")</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-azure-600/10 flex items-center justify-center text-[12px] font-semibold text-ember">2</span>
            <span>Click the <Terminal className="w-4 h-4 inline" /> icon in the header to open the agent panel</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-azure-600/10 flex items-center justify-center text-[12px] font-semibold text-ember">3</span>
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
          ShareTexts exposes a minimal REST API for agent integration.
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
                <div><span className="text-ember">Authorization:</span> Bearer {'<token>'}</div>
                <div><span className="text-ember">Content-Type:</span> application/json or application/octet-stream</div>
                <div><span className="text-ember">X-File-Name:</span> (optional) filename for file transfers</div>
              </div>
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-apple-ink dark:text-white mb-2">Body (JSON)</h4>
              <div className="space-y-1 text-[13px] font-mono text-apple-ink-muted dark:text-white/60">
                <div><span className="text-ember">roomId:</span> string (required)</div>
                <div><span className="text-ember">text:</span> string (for text transfers)</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <div className="flex items-center gap-3 mb-3">
            <span className="px-2 py-0.5 rounded-[4px] bg-azure-100 dark:bg-azure-900/30 text-[12px] font-semibold text-azure-700 dark:text-azure-400">GET</span>
            <code className="text-[14px] font-mono text-apple-ink dark:text-white">/health</code>
          </div>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60">
            Health check endpoint. Returns server status.
          </p>
        </div>

        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <div className="flex items-center gap-3 mb-3">
            <span className="px-2 py-0.5 rounded-[4px] bg-azure-100 dark:bg-azure-900/30 text-[12px] font-semibold text-azure-700 dark:text-azure-400">GET</span>
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
          ShareTexts is designed with privacy and security as core principles.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">            <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2 flex items-center gap-2">
            <Lock className="w-4 h-4 text-status-success" />
            Encrypted in the browser
          </h3>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/60">
            Transfer content is encrypted between devices. ShareTexts is designed for temporary handoffs, not permanent storage.
          </p>
        </div>

        <div className="p-5 rounded-[16px] bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3">
          <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-status-success" />
            Nothing is kept
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
        <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-3">What ShareTexts does NOT store</h3>
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
  // The questions live here (the Docs page owns this content, and
  // index.html publishes the same list as FAQPage structured data);
  // FaqSection is only the reading experience.
  const faqs: { q: string; a: string }[] = [
    {
      q: 'What is ShareTexts?',
      a: 'ShareTexts is a temporary bridge between two devices. Move text, links, photos, videos, and files directly from one screen to another. No app, no account, nothing kept.'
    },
    {
      q: 'How do devices discover each other?',
      a: 'There are four ways to connect: Nearby device, the 6-digit code, the QR code, and the share link. For Nearby device, open ShareTexts on both devices — if both are on the same supported network, the other device appears automatically. Tap it, the other device accepts, and the connection starts.'
    },
    {
      q: 'Is nearby discovery private?',
      a: 'Yes. Your device only appears while ShareTexts is open on it, and it disappears within about a minute of closing the tab. Other devices see only a temporary label like "Windows PC" — never your IP, accounts, or any permanent identifier. Devices already connected to a room are not listed, and this is never a global list of ShareTexts users.'
    },
    {
      q: 'Is it free?',
      a: 'Yes. ShareTexts is completely free to use.'
    },
    {
      q: 'Is it private?',
      a: 'Yes. Transfers are encrypted between devices. ShareTexts does not store your files, text, or transfer history.'
    },
    {
      q: 'What if my internet drops mid-transfer?',
      a: 'If the connection is interrupted, ShareTexts will tell you whether the transfer can be retried. For large files, we recommend a stable connection.'
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
      a: 'Any file type. ShareTexts transfers the original bytes without conversion. Images, videos, audio, documents, archives, code, and more.'
    },
    {
      q: 'Is there a file size limit?',
      a: 'ShareTexts has been tested with large files. Actual limits depend on your browser, device memory, and network stability. For very large files, a stable connection is recommended.'
    },
    {
      q: 'Does it work on mobile?',
      a: 'Yes. ShareTexts works in any modern mobile browser. No app download required.'
    },
    {
      q: 'Can I transfer between iPhone and Android?',
      a: 'Yes. ShareTexts works across all platforms and devices with a modern browser.'
    },
    {
      q: 'What is a Temporary Space?',
      a: 'A Temporary Space is a shared shelf that lives for a set time — 6 hours up to 7 days. You create it, get an 8-character space code, and share that code instead of files. Anyone with the code can add text, links, photos, or files, and everyone in the space sees them. When the time is up, the space closes and the content is deleted.'
    },
    {
      q: 'How do I join a Temporary Space with a code?',
      a: 'Open sharetexts.online/space/join, enter the 8-character code the creator gave you, and tap Join space. You can also paste a full space link — it carries the same access. Both the code and the link stop working when the space closes.'
    },
  ];

  return <FaqSection items={faqs} heading="Frequently Asked Questions" />;
}

const SECTION_IDS = NAV_ITEMS.map(i => i.id) as string[];

function sectionFromHash(): Section {
  // Deep links like /docs#faq land on the right section; anything unknown
  // (or absent) falls back to the overview. Guards for SSR-safety.
  if (typeof window === 'undefined') return 'overview';
  const h = window.location.hash.replace('#', '');
  return (SECTION_IDS as string[]).includes(h) ? (h as Section) : 'overview';
}

export function Docs() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<Section>(sectionFromHash);

  // Per-route document title — the home shell has its own static <title>.
  useEffect(() => {
    const previous = document.title;
    document.title = 'ShareTexts Docs | transfer text, photos & files between devices';
    return () => { document.title = previous; };
  }, []);

  // Browser back/forward moves between sections, same as clicking.
  useEffect(() => {
    const onHash = () => {
      const id = sectionFromHash();
      setActiveSection(id);
      window.scrollTo({ top: 0, behavior: 'auto' });
      requestAnimationFrame(() => {
        document.querySelector(`[data-section-pill="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const showSection = (id: Section) => {
    setActiveSection(id);
    // Keep the URL honest: shareable section links, no history spam.
    if (typeof window !== 'undefined' && window.location.hash !== `#${id}`) {
      history.replaceState(null, '', `#${id}`);
    }
    // A new section means new reading context — start at the top. Smooth
    // for pointer users; instant when reduced motion is requested.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // Keep the active mobile pill visible — without this it sits wherever
    // the gesture left the strip, often half-clipped past the edge.
    requestAnimationFrame(() => {
      document.querySelector(`[data-section-pill="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'overview': return <OverviewSection />;
      case 'transfer': return <TransferSection />;
      case 'pairing': return <PairingSection />;
      case 'nearby': return <NearbySection />;
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
      {/* Header — the shared PageHeader, so Docs, Legal and the 404 share one
          header instead of three hand-rolled near-copies. */}
      <PageHeader
        links={[
          { href: '/about', label: t('nav.about') },
          { href: '/privacy', label: t('nav.privacy') },
          { href: '/terms', label: t('nav.terms') },
        ]}
        currentLabel={t('nav.docs')}
      />

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
                    onClick={() => showSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[14px] font-medium transition-colors ${
                      activeSection === item.id
                        ? 'bg-azure-600/10 text-ember dark:text-azure-400'
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
                    onClick={() => showSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[14px] font-medium transition-colors ${
                      activeSection === item.id
                        ? 'bg-azure-600/10 text-ember dark:text-azure-400'
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
          {/* Mobile Navigation — horizontal scrollable pills at top of content.
              The edge mask makes a cut-off pill read as "more this way",
              not as a broken layout. */}
          <div className="md:hidden st-edge-fade -mx-6 px-6 mb-6 overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2 min-w-max">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  data-section-pill={item.id}
                  onClick={() => showSection(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                    activeSection === item.id
                      ? 'bg-ember text-white shadow-sm'
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

      {/* Footer — the same one every long-form page carries, so the site
          speaks one navigation language from anywhere. */}
      <SiteFooter />
    </div>
  );
}
