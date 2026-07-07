import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input, TextArea, Badge } from './ui';
import { HardDrive, Upload, Users, Lock, Globe, FolderOpen, Eye, EyeOff, X, Search, Shield, FileKey } from 'lucide-react';
import { callEntryPointWithWallet } from '../casper-client';
import { CONTRACTS } from '../casper-client';
import * as sdk from 'casper-js-sdk';
import { encryptFile, decryptFile, sha256Buffer } from '../utils/storage-crypto';
import type { TxRecord } from '../types';

type StorageMode = 'public' | 'personal' | 'encrypted';
type StoredFile = {
  jobId: string;
  spaceName: string;
  fileHash: string;
  fileName: string;
  sizeMb: number;
  mode: StorageMode;
  anonymous: boolean;
  tags: string;
  description: string;
  encrypted: boolean;
  status: string;
  timestamp: number;
};

const ANONYMOUS_HASH = new Uint8Array(32).fill(0);

let _helia: any = null;
let _heliaFs: any = null;
async function ensureHelia(): Promise<{ helia: any; fs: any }> {
  if (_helia && _heliaFs) return { helia: _helia, fs: _heliaFs };
  const { createHelia } = await import('helia');
  const { unixfs } = await import('@helia/unixfs');
  _helia = await createHelia();
  _heliaFs = unixfs(_helia);
  return { helia: _helia, fs: _heliaFs };
}

export default function StorageHub({ provider, publicKeyHex, accountHash, onTx }: {
  provider: any; publicKeyHex: string; accountHash: string; onTx: (tx: TxRecord) => void;
}) {
  const canSign = !!provider && !!publicKeyHex;
  const [activeTab, setActiveTab] = useState<StorageMode | 'lists'>('public');
  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Upload form state
  const [uploadMode, setUploadMode] = useState<StorageMode>('public');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [spaceName, setSpaceName] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [amount, setAmount] = useState('5');
  const [uploadStep, setUploadStep] = useState<'form' | 'encrypting' | 'uploading' | 'submitting'>('form');

  // Load stored files from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chimera_storage_files');
      if (raw) setFiles(JSON.parse(raw));
    } catch {}
  }, []);

  const saveFiles = useCallback((next: StoredFile[]) => {
    setFiles(next);
    try { localStorage.setItem('chimera_storage_files', JSON.stringify(next)); } catch {}
  }, []);

  const uploadFile = async (encryptedBlob: Blob, meta: { spaceName: string; fileHash: string; fileName: string; sizeMb: number; mode: StorageMode; anonymous: boolean; tags: string; description: string; encrypted: boolean }) => {
    const { fs } = await ensureHelia();
    const bytes = new Uint8Array(await encryptedBlob.arrayBuffer());
    const cid = await fs.addBytes(bytes);
    return { cid: cid.toString(), fileName: meta.fileName };
  };

  const submitStorageJob = async (meta: { spaceName: string; fileHash: string; sizeMb: number; mode: StorageMode; anonymous: boolean; tags: string; description: string; encrypted: boolean }) => {
    const consumerHash = anonymous ? ANONYMOUS_HASH : sdk.PublicKey.fromHex(publicKeyHex).accountHash().toBytes();
    const zeroHash = new Uint8Array(32);
    const amountMotes = Math.floor(parseFloat(amount || '0') * 1e9).toString();
    const params = new URLSearchParams();
    params.set('space', meta.spaceName);
    params.set('hash', meta.fileHash);
    params.set('size', String(meta.sizeMb));
    params.set('anon', meta.anonymous ? '1' : '0');
    params.set('enc', meta.encrypted ? '1' : '0');
    params.set('tags', meta.tags);
    params.set('desc', btoa(meta.description));
    const orderId = `STORAGE:${meta.mode.toUpperCase()}:${params.toString()}`;

    const result = await callEntryPointWithWallet(provider, publicKeyHex, CONTRACTS.escrowVault, 'create_job', {
      consumer: sdk.CLValue.newCLByteArray(consumerHash),
      provider: sdk.CLValue.newCLByteArray(zeroHash),
      amount: sdk.CLValue.newCLUInt512(amountMotes),
      provider_fee_bps: sdk.CLValue.newCLUint64('0'),
      order_id: sdk.CLValue.newCLString(orderId),
    }, '50000000000');

    if (result.error) {
      onTx({ id: Date.now().toString(), deployHash: result.deployHash, entryPoint: 'create_job', contract: 'EscrowVault', status: 'error', error: result.error });
      throw new Error(result.error);
    }
    if (result.deployHash) {
      const jobId = `job:${(anonymous ? ANONYMOUS_HASH : consumerHash).map(b => b.toString(16).padStart(2, '0')).join('')}:0`;
      onTx({ id: Date.now().toString(), deployHash: result.deployHash, entryPoint: 'create_job', contract: 'EscrowVault', status: 'pending' });
      const next: StoredFile = {
        jobId,
        spaceName: meta.spaceName,
        fileHash: meta.fileHash,
        fileName: meta.fileName,
        sizeMb: meta.sizeMb,
        mode: meta.mode,
        anonymous: meta.anonymous,
        tags: meta.tags,
        description: meta.description,
        encrypted: meta.encrypted,
        status: 'pending',
        timestamp: Date.now(),
      };
      saveFiles([next, ...files]);
      return result.deployHash;
    }
    throw new Error('Deploy failed: no deploy hash returned');
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSign || !selectedFile || !spaceName.trim()) return;
    if (uploadMode === 'encrypted') {
      if (!password || password !== confirmPassword) return alert('Passwords must match for encrypted storage');
    }

    setLoading(true);
    setUploadStep('encrypting');
    try {
      let blob: Blob = selectedFile;
      const isEncrypted = uploadMode === 'encrypted';
      if (isEncrypted) {
        blob = await encryptFile(selectedFile, password);
      }
      const fileBuffer = await blob.arrayBuffer();
      const fileHash = await sha256Buffer(fileBuffer);
      const sizeMb = Math.ceil(blob.size / (1024 * 1024));
      const meta = {
        spaceName: spaceName.trim(),
        fileHash,
        fileName: selectedFile.name,
        sizeMb,
        mode: uploadMode,
        anonymous: uploadMode === 'public' && anonymous,
        tags,
        description,
        encrypted: isEncrypted,
      };

      setUploadStep('uploading');
      const uploadResult = await uploadFile(blob, meta);
      meta.fileHash = uploadResult.cid;
      setUploadStep('submitting');
      await submitStorageJob(meta);
      setShowUpload(false);
      resetForm();
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setLoading(false);
      setUploadStep('form');
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setSpaceName('');
    setTags('');
    setDescription('');
    setAnonymous(false);
    setPassword('');
    setConfirmPassword('');
    setUploadMode('public');
  };

  const downloadFile = async (file: StoredFile) => {
    let pw = '';
    if (file.encrypted) {
      pw = window.prompt('Enter decryption key:') || '';
      if (!pw) return;
    }
    const { fs } = await ensureHelia();
    const chunks: Uint8Array[] = [];
    for await (const chunk of fs.cat(file.fileHash)) {
      chunks.push(chunk);
    }
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    let blob: Blob = new Blob([merged]);
    if (file.encrypted) {
      blob = await decryptFile(blob, pw);
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredFiles = files.filter(f => {
    if (activeTab === 'lists') return true;
    if (activeTab === 'public') return f.mode === 'public';
    if (activeTab === 'personal') return f.mode === 'personal';
    if (activeTab === 'encrypted') return f.mode === 'encrypted';
    return true;
  }).filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    return f.fileName.toLowerCase().includes(q) || f.tags.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
  });

  const tabs = [
    { id: 'public', label: 'Public Sharing', icon: Users, desc: 'Files can be found and downloaded by anyone' },
    { id: 'personal', label: 'Personal Storage', icon: Globe, desc: 'Not searchable; downloadable only with the CID' },
    { id: 'encrypted', label: 'Encrypted Storage', icon: Lock, desc: 'Locally encrypted before upload; protected by key' },
    { id: 'lists', label: 'Content List', icon: FolderOpen, desc: 'Organize and collect resources' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><HardDrive className="h-6 w-6 text-[#00e5ff]" />Chimera Storage</h2>
          <p className="text-sm text-[#7a7468]">BTFS-inspired decentralized storage with public, personal, and encrypted modes.</p>
        </div>
        <Button onClick={() => setShowUpload(true)} disabled={!canSign} className="text-xs h-9"><Upload className="h-4 w-4 mr-1" />Upload</Button>
      </div>

      {!canSign && (
        <div className="text-sm text-yellow-400 bg-yellow-500/5 border border-yellow-500/10 p-3 rounded-lg">
          Connect a Casper Wallet to upload files. The wallet must be funded to pay for on-chain storage jobs.
        </div>
      )}

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <Card key={t.id} onClick={() => setActiveTab(t.id as any)} className={`p-4 cursor-pointer ${active ? 'border-[#00e5ff]/40 bg-white/[0.03]' : ''}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${active ? 'bg-[#00e5ff]/15 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468]'}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm">{t.label}</h3>
              </div>
              <p className="text-xs text-[#7a7468]">{t.desc}</p>
            </Card>
          );
        })}
      </div>

      {/* Search + list */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7a7468]" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files, tags, or descriptions..."
              className="w-full h-9 rounded-md border border-white/10 bg-transparent pl-9 pr-3 text-sm placeholder:text-[#7a7468] focus:outline-none focus:ring-1 focus:ring-[#00e5ff]" />
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/[0.01]">
            <HardDrive className="h-10 w-10 text-[#7a7468] mx-auto mb-3" />
            <p className="text-sm text-[#7a7468]">No files in this section yet.</p>
            <Button variant="outline" onClick={() => setShowUpload(true)} disabled={!canSign} className="mt-3 text-xs">Upload a file</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredFiles.map((file) => (
              <Card key={file.jobId} className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileKey className="h-4 w-4 text-[#00e5ff]" />
                    <span className="text-sm font-medium truncate max-w-[200px]">{file.fileName}</span>
                  </div>
                  <Badge variant={file.mode === 'public' ? 'default' : file.mode === 'encrypted' ? 'warning' : 'success'}>
                    {file.mode === 'public' ? 'Public' : file.mode === 'encrypted' ? 'Encrypted' : 'Personal'}
                  </Badge>
                </div>
                <div className="text-xs text-[#7a7468] space-y-1">
                  <div className="flex items-center gap-2"><span>Space:</span> <span className="text-[#e8e2d8]">{file.spaceName}</span></div>
                  <div className="flex items-center gap-2"><span>CID:</span> <span className="font-mono text-[#e8e2d8]">{file.fileHash.slice(0, 16)}...</span></div>
                  <div className="flex items-center gap-2"><span>Size:</span> <span className="text-[#e8e2d8]">{file.sizeMb} MB</span></div>
                  {file.tags && <div className="flex items-center gap-2"><span>Tags:</span> <span className="text-[#e8e2d8]">{file.tags}</span></div>}
                  {file.description && <p className="text-[#e8e2d8] line-clamp-2">{file.description}</p>}
                  {file.anonymous && <div className="flex items-center gap-1 text-[#a855f7]"><EyeOff className="h-3 w-3" /> Anonymous upload</div>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => downloadFile(file)} className="text-xs flex-1">Download</Button>
                  {file.mode === 'public' && (
                    <Button variant="secondary" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/storage/download/${encodeURIComponent(file.spaceName)}/${file.fileHash}`)} className="text-xs">Copy Link</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 relative">
            <button onClick={() => { setShowUpload(false); resetForm(); }} className="absolute right-4 top-4 text-[#7a7468] hover:text-[#e8e2d8]"><X className="h-5 w-5" /></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/15 rounded-lg"><Upload className="h-5 w-5 text-blue-400" /></div>
              <h3 className="text-lg font-semibold">Upload to Chimera Storage</h3>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              {/* Mode selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Storage Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['public', 'personal', 'encrypted'] as StorageMode[]).map((m) => (
                    <button key={m} type="button" onClick={() => setUploadMode(m)}
                      className={`text-xs px-2 py-2 rounded-lg border transition-colors ${uploadMode === m ? 'bg-[#00e5ff]/15 border-[#00e5ff]/30 text-[#00e5ff]' : 'bg-white/5 border-white/10 text-[#7a7468] hover:bg-white/10'}`}>
                      {m === 'public' ? 'Public' : m === 'personal' ? 'Personal' : 'Encrypted'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#7a7468]">
                  {uploadMode === 'public' && 'Anyone can find and download this file.'}
                  {uploadMode === 'personal' && 'Only those with the CID can download this file.'}
                  {uploadMode === 'encrypted' && 'File is encrypted locally with your key before upload.'}
                </p>
              </div>

              {/* File picker */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Select File <span className="text-red-400">*</span></label>
                <div className="border border-dashed border-white/20 rounded-lg p-4 text-center hover:border-[#00e5ff]/40 transition-colors">
                  <input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" id="hub-file-upload" />
                  <label htmlFor="hub-file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-[#7a7468]" />
                    {selectedFile ? (
                      <span className="text-xs text-[#00e5ff]">{selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                    ) : (
                      <span className="text-xs text-[#7a7468]">Click to select a file</span>
                    )}
                  </label>
                </div>
              </div>

              <Input label="Space Name" value={spaceName} onChange={setSpaceName} placeholder="e.g. my-backups" />
              <Input label="Tags" value={tags} onChange={setTags} placeholder="comma, separated, tags" />
              <TextArea label="Description" value={description} onChange={setDescription} placeholder="What is this file?" />

              {uploadMode === 'public' && (
                <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                  <div className="flex items-center gap-2">
                    {anonymous ? <EyeOff className="h-4 w-4 text-[#a855f7]" /> : <Eye className="h-4 w-4 text-[#7a7468]" />}
                    <div>
                      <div className="text-sm font-medium">Anonymous Upload</div>
                      <div className="text-xs text-[#7a7468]">Others will not see who uploaded the content.</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => setAnonymous(!anonymous)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${anonymous ? 'bg-[#a855f7]' : 'bg-white/10'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${anonymous ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              )}

              {uploadMode === 'encrypted' && (
                <div className="space-y-3 rounded-lg border border-[#00e5ff]/20 bg-[#00e5ff]/5 p-3">
                  <div className="flex items-center gap-2 text-[#00e5ff]"><Shield className="h-4 w-4" /><span className="text-sm font-medium">Encryption Key</span></div>
                  <p className="text-xs text-[#7a7468]">Anyone with the key can decrypt. The key is not saved by Chimera; losing it means losing the file.</p>
                  <Input label="Set Key" type="password" value={password} onChange={setPassword} placeholder="Strong password" />
                  <Input label="Confirm Key" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" />
                </div>
              )}

              <Input label="Funds (CSPR)" value={amount} onChange={setAmount} type="number" />

              <div className="pt-2">
                <Button type="submit" disabled={!canSign || !selectedFile || !spaceName.trim() || loading} className="w-full">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      {uploadStep === 'encrypting' && 'Encrypting...'}
                      {uploadStep === 'uploading' && 'Uploading...'}
                      {uploadStep === 'submitting' && 'Submitting on-chain...'}
                    </span>
                  ) : (
                    <><Upload className="h-4 w-4 mr-1" />Upload to Storage</>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
