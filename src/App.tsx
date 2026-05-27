import { useState, useEffect, useRef } from 'react';
import { db, auth } from './firebase';
import { ref, push, onValue, set, remove, serverTimestamp, off, get } from 'firebase/database';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, User,
} from 'firebase/auth';
import YouTube from 'react-youtube';

const DARK = { bg: '#0a0a0a', bg2: '#111', bg3: '#181818', fg: '#fafaf8', fg2: '#777', fg3: '#3a3a3a', border: '#1c1c1c', border2: '#262626' };
const LIGHT = { bg: '#fafaf8', bg2: '#f2f2f0', bg3: '#e8e8e6', fg: '#0a0a0a', fg2: '#666', fg3: '#aaa', border: '#e4e4e0', border2: '#d0d0cc' };

const YT_API_KEY = 'AIzaSyDtbHk4XNsk7ayDF4IyqU5T8idw8BfLV3o';

type Screen = 'onboarding' | 'home' | 'room' | 'yt-search' | 'create-room' | 'friends' | 'profile' | 'friend-profile';
type Message = { id: string; user: string; text?: string; imageUrl?: string; type?: 'text' | 'image'; time?: number };
type Room = { id: string; title: string; source: 'youtube' | 'twitch' | 'file'; url?: string; videoId?: string; host: string; privacy: 'public' | 'friends' | 'private'; createdAt?: number };
type Friend = { uid: string; name: string; email: string };
type FriendRequest = { id: string; fromUid: string; fromName: string; fromEmail: string; status: string; ts: number };

function Wordmark({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ fontWeight: 300, fontSize: size, letterSpacing: size * 0.07, color, lineHeight: 1.3, fontFamily: 'Inter, sans-serif' }}>OUTRO</span>
      <div style={{ position: 'absolute', left: '8%', right: '8%', top: '48%', height: 1.2, backgroundColor: color }} />
    </div>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [screen, setScreen] = useState<Screen>('onboarding');
  const [activeTab, setActiveTab] = useState<'home' | 'friends' | 'profile'>('home');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [participants, setParticipants] = useState<any[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ytQuery, setYtQuery] = useState('');
  const [ytResults, setYtResults] = useState<any[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createPrivacy, setCreatePrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [sourceTab, setSourceTab] = useState<'youtube' | 'twitch' | 'file'>('youtube');
  const [fileUrl, setFileUrl] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);

  const T = isDark ? DARK : LIGHT;
  const myName = user?.email?.split('@')[0] || 'user';

  useEffect(() => {
    document.body.style.backgroundColor = T.bg;
    document.body.style.color = T.fg;
    document.body.style.margin = '0';
    document.body.style.fontFamily = 'Inter, sans-serif';
  }, [isDark]);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      if (u) {
        setScreen('home');
        set(ref(db, `users/${u.uid}`), { name: u.email?.split('@')[0], email: u.email, online: true });
      }
    });
  }, []);

  useEffect(() => {
    const r = ref(db, 'rooms');
    onValue(r, snap => {
      const data = snap.val();
      if (!data) { setRooms([]); return; }
      const list: Room[] = Object.entries(data).map(([id, v]: any) => ({ id, ...v }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRooms(list.filter(r => r.privacy === 'public'));
    });
    return () => off(r);
  }, []);

  useEffect(() => {
    if (!currentRoom) return;
    const r = ref(db, `rooms/${currentRoom.id}/messages`);
    onValue(r, snap => {
      const data = snap.val();
      if (!data) { setMessages([]); return; }
      const msgs: Message[] = Object.entries(data).map(([id, v]: any) => ({ id, ...v }));
      msgs.sort((a, b) => (a.time || 0) - (b.time || 0));
      setMessages(msgs);
      setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 100);
    });
    return () => off(r);
  }, [currentRoom]);

  useEffect(() => {
    if (!currentRoom || !user) return;
    const pRef = ref(db, `rooms/${currentRoom.id}/participants/${user.uid}`);
    set(pRef, { name: myName, joinedAt: Date.now() });
    const allRef = ref(db, `rooms/${currentRoom.id}/participants`);
    onValue(allRef, snap => {
      const data = snap.val();
      setParticipants(data ? Object.entries(data).map(([uid, v]: any) => ({ uid, ...v })) : []);
    });
    return () => { remove(pRef); off(allRef); };
  }, [currentRoom, user]);

  useEffect(() => {
    if (!user) return;
    const r = ref(db, `users/${user.uid}/friends`);
    onValue(r, snap => {
      const data = snap.val();
      setFriends(data ? Object.entries(data).map(([uid, v]: any) => ({ uid, ...v })) : []);
    });
    return () => off(r);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const r = ref(db, `users/${user.uid}/friendRequests/incoming`);
    onValue(r, snap => {
      const data = snap.val();
      if (!data) { setIncomingRequests([]); return; }
      setIncomingRequests(Object.entries(data).map(([id, v]: any) => ({ id, ...v })).filter((r: any) => r.status === 'pending'));
    });
    return () => off(r);
  }, [user]);

  // Sync play state from Firebase
  useEffect(() => {
    if (!currentRoom) return;
    const r = ref(db, `rooms/${currentRoom.id}/sync`);
    onValue(r, snap => {
      const data = snap.val();
      if (!data) return;
      setIsPlaying(data.playing);
      if (ytPlayerRef.current) {
        if (data.playing) ytPlayerRef.current.playVideo();
        else ytPlayerRef.current.pauseVideo();
      }
    });
    return () => off(r);
  }, [currentRoom]);

  const handleAuth = async () => {
    if (!email || !password) { setAuthError('Заполни все поля'); return; }
    setAuthError(''); setAuthLoading(true);
    try {
      if (isLogin) await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      setAuthError(
        e.code === 'auth/invalid-credential' ? 'Неверный email или пароль' :
        e.code === 'auth/email-already-in-use' ? 'Email уже используется' :
        e.code === 'auth/weak-password' ? 'Минимум 6 символов' :
        e.code === 'auth/invalid-email' ? 'Неверный email' : 'Ошибка. Попробуй снова'
      );
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    if (user) set(ref(db, `users/${user.uid}/online`), false);
    await signOut(auth);
    setScreen('onboarding');
    setUser(null);
  };

  const sendMessage = async () => {
    if (!message.trim() || !currentRoom || !user) return;
    await push(ref(db, `rooms/${currentRoom.id}/messages`), { user: myName, text: message.trim(), type: 'text', time: serverTimestamp() });
    setMessage('');
  };

  const createRoom = async (videoId?: string, ytTitle?: string, source: 'youtube' | 'twitch' | 'file' = 'youtube') => {
    if (!user) return;
    const title = ytTitle || createTitle || 'Новая комната';
    const roomData: any = { title, source, host: myName, privacy: createPrivacy, createdAt: Date.now() };
    if (videoId) roomData.videoId = videoId;
    if (fileUrl && !videoId) roomData.url = fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`;
    const newRef = await push(ref(db, 'rooms'), roomData);
    setCurrentRoom({ id: newRef.key!, ...roomData });
    setMessages([]);
    setIsPlaying(false);
    setScreen('room');
    setCreateTitle(''); setFileUrl('');
  };

  const syncPlay = async (playing: boolean) => {
    if (!currentRoom) return;
    await set(ref(db, `rooms/${currentRoom.id}/sync`), { playing, ts: Date.now() });
  };

  const searchYT = async () => {
    if (!ytQuery.trim()) return;
    setYtLoading(true);
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(ytQuery)}&type=video&maxResults=20&key=${YT_API_KEY}`);
      const data = await res.json();
      setYtResults(data.items?.map((i: any) => ({ id: i.id.videoId, title: i.snippet.title, thumb: i.snippet.thumbnails.medium.url, channel: i.snippet.channelTitle })) || []);
    } catch { alert('Ошибка поиска'); }
    setYtLoading(false);
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    const snap = await get(ref(db, 'users'));
    const data = snap.val();
    if (!data) { setSearchResults([]); return; }
    setSearchResults(Object.entries(data).filter(([uid, v]: any) => uid !== user?.uid && (v.name?.toLowerCase().includes(searchQuery.toLowerCase()) || v.email?.toLowerCase().includes(searchQuery.toLowerCase()))).map(([uid, v]: any) => ({ uid, ...v })));
  };

  const sendFriendRequest = async (toUid: string, toName: string, toEmail: string) => {
    if (!user) return;
    await set(ref(db, `users/${toUid}/friendRequests/incoming/${user.uid}`), { fromUid: user.uid, fromName: myName, fromEmail: user.email, status: 'pending', ts: Date.now() });
    alert(`Запрос отправлен ${toName}`);
  };

  const acceptFriendRequest = async (req: FriendRequest) => {
    if (!user) return;
    await set(ref(db, `users/${user.uid}/friends/${req.fromUid}`), { uid: req.fromUid, name: req.fromName, email: req.fromEmail });
    await set(ref(db, `users/${req.fromUid}/friends/${user.uid}`), { uid: user.uid, name: myName, email: user.email });
    await remove(ref(db, `users/${user.uid}/friendRequests/incoming/${req.fromUid}`));
  };

  const leaveRoom = () => {
    setCurrentRoom(null); setMessages([]); setParticipants([]); setIsPlaying(false);
    setScreen('home'); setActiveTab('home');
  };

  const css = (obj: Record<string, any>) => obj as React.CSSProperties;

  const styles = {
    safe: css({ minHeight: '100vh', backgroundColor: T.bg, color: T.fg }),
    topbar: css({ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `0.5px solid ${T.border}`, backgroundColor: T.bg, position: 'sticky' as const, top: 0, zIndex: 50 }),
    body: css({ padding: 20, maxWidth: 900, margin: '0 auto' }),
    srchbar: css({ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: '0 12px', flex: 1 }),
    inp: css({ backgroundColor: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: '12px 14px', color: T.fg, fontSize: 14, width: '100%', outline: 'none', boxSizing: 'border-box' as const }),
    btnp: css({ backgroundColor: T.fg, color: T.bg, border: 'none', borderRadius: 8, padding: '14px 20px', fontFamily: 'monospace', letterSpacing: 1, cursor: 'pointer', fontSize: 13, width: '100%' }),
    btns: css({ backgroundColor: 'transparent', color: T.fg, border: `0.5px solid ${T.border2}`, borderRadius: 8, padding: '13px 20px', fontFamily: 'monospace', letterSpacing: 1, cursor: 'pointer', fontSize: 13, width: '100%' }),
    card: css({ backgroundColor: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 10, marginBottom: 10, overflow: 'hidden', cursor: 'pointer' }),
    tabbar: css({ display: 'flex', borderTop: `0.5px solid ${T.border}`, backgroundColor: T.bg, position: 'sticky' as const, bottom: 0 }),
    tab: css({ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '10px 0', gap: 3, cursor: 'pointer', border: 'none', background: 'none' }),
    seclbl: css({ fontSize: 10, letterSpacing: 2, color: T.fg3, fontFamily: 'monospace' }),
    menuitem: css({ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 0', borderBottom: `0.5px solid ${T.border}`, cursor: 'pointer' }),
    field: css({ backgroundColor: 'transparent', border: 'none', borderBottom: `0.5px solid ${T.border2}`, padding: '14px 0', color: T.fg, fontSize: 14, width: '100%', outline: 'none', marginBottom: 20 }),
    modal: css({ position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }),
    sheet: css({ backgroundColor: T.bg2, borderRadius: '16px 16px 0 0', padding: 24, paddingBottom: 40, width: '100%', maxWidth: 600 }),
  };

  if (screen === 'onboarding') return (
    <div style={styles.safe}>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative' }}>
        <button onClick={() => setIsDark(!isDark)} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: `0.5px solid ${T.border2}`, borderRadius: 6, padding: '8px 12px', color: T.fg2, cursor: 'pointer', fontSize: 16 }}>{isDark ? '☀' : '◑'}</button>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <Wordmark color={T.fg} size={38} />
            <div style={{ color: T.fg3, fontSize: 9, letterSpacing: 3, fontStyle: 'italic', marginTop: 14, fontFamily: 'monospace' }}>DIVINA COMMEDIA</div>
          </div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: T.fg3, marginBottom: 20 }}>{isLogin ? 'ВХОД' : 'РЕГИСТРАЦИЯ'}</div>
          <input style={styles.field} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" type="email" />
          <input style={styles.field} placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} type="password" onKeyDown={e => e.key === 'Enter' && handleAuth()} />
          {authError && <div style={{ color: '#ff5555', fontSize: 12, marginBottom: 12, fontFamily: 'monospace' }}>{authError}</div>}
          <button style={styles.btnp} onClick={handleAuth} disabled={authLoading}>{authLoading ? '...' : isLogin ? 'ВОЙТИ →' : 'СОЗДАТЬ →'}</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 0.5, backgroundColor: T.border }} />
            <span style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', letterSpacing: 2 }}>или</span>
            <div style={{ flex: 1, height: 0.5, backgroundColor: T.border }} />
          </div>
          <button style={{ ...styles.btns, marginTop: 0 }} onClick={() => { setIsLogin(!isLogin); setAuthError(''); }}>{isLogin ? 'СОЗДАТЬ АККАУНТ' : 'УЖЕ ЕСТЬ АККАУНТ'}</button>
          <div style={{ textAlign: 'center', marginTop: 48, color: T.border2, fontSize: 9, letterSpacing: 2, fontFamily: 'monospace' }}>PROD. BY MARL</div>
        </div>
      </div>
    </div>
  );

  if (screen === 'room' && currentRoom) return (
    <div style={styles.safe}>
      <div style={{ ...styles.topbar, justifyContent: 'space-between' }}>
        <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 18 }}>✕</button>
        <Wordmark color={T.fg} size={13} />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button onClick={() => setShowParticipants(true)} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 13, fontFamily: 'monospace' }}>⁋ {participants.length}</button>
          <button onClick={() => setShowInvite(true)} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 18 }}>⊕</button>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 57px)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ backgroundColor: '#000', aspectRatio: '16/9', width: '100%' }}>
            {currentRoom.source === 'youtube' && currentRoom.videoId ? (
              <YouTube
                videoId={currentRoom.videoId}
                opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }}
                onReady={e => { ytPlayerRef.current = e.target; }}
                onPlay={() => syncPlay(true)}
                onPause={() => syncPlay(false)}
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <iframe src={currentRoom.url} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen title="video" />
            )}
          </div>
          <div style={{ padding: '10px 14px', borderBottom: `0.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: T.fg, fontSize: 13, fontWeight: 500 }}>{currentRoom.title}</span>
            {currentRoom.source === 'youtube' && (
              <button onClick={() => syncPlay(!isPlaying)} style={{ backgroundColor: T.bg2, border: `0.5px solid ${T.border2}`, borderRadius: 6, padding: '6px 12px', color: T.fg, cursor: 'pointer', fontFamily: 'monospace', fontSize: 10 }}>
                {isPlaying ? '⏸ ПАУЗА' : '▶ ИГРАТЬ'}
              </button>
            )}
          </div>
        </div>

        <div style={{ width: 300, borderLeft: `0.5px solid ${T.border}`, display: 'flex', flexDirection: 'column' }}>
          <div ref={scrollRef} style={{ flex: 1, padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: T.bg2, border: `0.5px solid ${T.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: T.fg2, fontFamily: 'monospace', flexShrink: 0 }}>{m.user?.[0]?.toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 10, color: T.fg3, fontFamily: 'monospace', marginBottom: 2, letterSpacing: 1 }}>{m.user?.toUpperCase()}</div>
                  {m.type === 'image' && m.imageUrl ? <img src={m.imageUrl} alt="" style={{ maxWidth: 180, borderRadius: 8, marginTop: 4 }} /> : <div style={{ fontSize: 13, color: T.fg, lineHeight: 1.4 }}>{m.text}</div>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 12px', borderTop: `0.5px solid ${T.border}`, display: 'flex', gap: 8 }}>
            <input style={{ ...styles.inp, flex: 1, padding: '9px 12px' }} placeholder="Написать..." value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} />
            <button onClick={sendMessage} style={{ backgroundColor: T.fg, color: T.bg, border: 'none', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: 16 }}>➤</button>
          </div>
        </div>
      </div>

      {showParticipants && (
        <div style={styles.modal} onClick={() => setShowParticipants(false)}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ color: T.fg, fontFamily: 'monospace', letterSpacing: 2 }}>УЧАСТНИКИ · {participants.length}</span>
              <button onClick={() => setShowParticipants(false)} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {participants.map((p: any) => (
              <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: T.bg3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: T.fg2, fontFamily: 'monospace' }}>{p.name?.[0]?.toUpperCase()}</div>
                <span style={{ color: T.fg, fontSize: 13 }}>{p.name}</span>
                {p.name === currentRoom.host && <span style={{ color: T.fg3, fontSize: 9, fontFamily: 'monospace', marginLeft: 'auto', letterSpacing: 1 }}>ХОСТ</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <div style={styles.modal} onClick={() => setShowInvite(false)}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ color: T.fg, fontFamily: 'monospace', letterSpacing: 2 }}>ПРИГЛАСИТЬ</span>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ backgroundColor: T.bg3, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 }}>ССЫЛКА НА КОМНАТУ</div>
              <div style={{ color: T.fg, fontSize: 13, fontFamily: 'monospace' }}>outro.vercel.app/room/{currentRoom.id}</div>
            </div>
            <button style={styles.btnp} onClick={() => { navigator.clipboard.writeText(`outro.vercel.app/room/${currentRoom.id}`); alert('Скопировано!'); setShowInvite(false); }}>КОПИРОВАТЬ ССЫЛКУ</button>
          </div>
        </div>
      )}
    </div>
  );

  if (screen === 'yt-search') return (
    <div style={styles.safe}>
      <div style={styles.topbar}>
        <button onClick={() => { setScreen('home'); setYtResults([]); setYtQuery(''); }} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 18 }}>←</button>
        <div style={styles.srchbar}>
          <span style={{ color: T.fg3 }}>⊙</span>
          <input style={{ flex: 1, background: 'none', border: 'none', color: T.fg, fontSize: 14, padding: '9px 0', outline: 'none' }} placeholder="Поиск на YouTube..." value={ytQuery} onChange={e => setYtQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchYT()} autoFocus />
          {ytQuery && <button onClick={() => { setYtQuery(''); setYtResults([]); }} style={{ background: 'none', border: 'none', color: T.fg3, cursor: 'pointer', fontSize: 16 }}>✕</button>}
        </div>
        <button onClick={searchYT} style={{ backgroundColor: T.fg, color: T.bg, border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'monospace', letterSpacing: 1, cursor: 'pointer', fontSize: 12 }}>НАЙТИ</button>
      </div>
      <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
        {ytLoading ? <div style={{ textAlign: 'center', padding: 60, color: T.fg3 }}>...</div> :
          ytResults.length === 0 ? <div style={{ textAlign: 'center', padding: 60, color: T.fg3, fontFamily: 'monospace', letterSpacing: 2 }}>ВВЕДИТЕ ЗАПРОС</div> :
          <div style={{ display: 'grid', gap: 16 }}>
            {ytResults.map(item => (
              <div key={item.id} style={{ display: 'flex', gap: 12, cursor: 'pointer' }} onClick={() => createRoom(item.id, item.title, 'youtube')}>
                <img src={item.thumb} alt="" style={{ width: 160, height: 90, borderRadius: 6, objectFit: 'cover', backgroundColor: T.bg2 }} />
                <div>
                  <div style={{ color: T.fg, fontSize: 14, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>{item.channel.toUpperCase()}</div>
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );

  if (screen === 'create-room') return (
    <div style={styles.safe}>
      <div style={styles.topbar}>
        <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 18 }}>←</button>
        <span style={{ color: T.fg, fontFamily: 'monospace', letterSpacing: 2, marginLeft: 8 }}>НОВАЯ КОМНАТА</span>
      </div>
      <div style={{ ...styles.body, maxWidth: 480 }}>
        <div style={{ ...styles.seclbl, marginBottom: 12 }}>ИСТОЧНИК</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['youtube', 'twitch', 'file'] as const).map(t => (
            <button key={t} onClick={() => setSourceTab(t)} style={{ flex: 1, padding: 10, border: `0.5px solid ${sourceTab === t ? T.fg : T.border}`, borderRadius: 8, backgroundColor: sourceTab === t ? T.bg2 : 'transparent', color: sourceTab === t ? T.fg : T.fg3, cursor: 'pointer', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1 }}>{t.toUpperCase()}</button>
          ))}
        </div>
        {sourceTab === 'youtube' && <button style={{ ...styles.btns, marginBottom: 20 }} onClick={() => setScreen('yt-search')}>НАЙТИ ВИДЕО НА YOUTUBE →</button>}
        {(sourceTab === 'twitch' || sourceTab === 'file') && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...styles.seclbl, marginBottom: 10 }}>{sourceTab === 'twitch' ? 'ССЫЛКА НА КАНАЛ' : 'ПРЯМАЯ ССЫЛКА НА MP4'}</div>
            <input style={styles.inp} placeholder={sourceTab === 'twitch' ? 'twitch.tv/channel' : 'https://example.com/video.mp4'} value={fileUrl} onChange={e => setFileUrl(e.target.value)} />
          </div>
        )}
        <div style={{ ...styles.seclbl, marginBottom: 10 }}>НАЗВАНИЕ</div>
        <input style={{ ...styles.inp, marginBottom: 20 }} placeholder="Название комнаты..." value={createTitle} onChange={e => setCreateTitle(e.target.value)} />
        <div style={{ ...styles.seclbl, marginBottom: 10 }}>ПРИВАТНОСТЬ</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['public', 'friends', 'private'] as const).map(p => (
            <button key={p} onClick={() => setCreatePrivacy(p)} style={{ flex: 1, padding: 10, border: `0.5px solid ${createPrivacy === p ? T.fg : T.border}`, borderRadius: 8, backgroundColor: createPrivacy === p ? T.bg2 : 'transparent', color: createPrivacy === p ? T.fg : T.fg3, cursor: 'pointer', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1 }}>{p === 'public' ? 'ПУБЛИЧНАЯ' : p === 'friends' ? 'ДРУЗЬЯ' : 'ПРИВАТНАЯ'}</button>
          ))}
        </div>
        <button style={styles.btnp} onClick={() => createRoom(undefined, undefined, sourceTab)}>СОЗДАТЬ КОМНАТУ →</button>
      </div>
    </div>
  );

  if (screen === 'friend-profile' && selectedFriend) {
    const isFriend = friends.some(f => f.uid === selectedFriend.uid);
    return (
      <div style={styles.safe}>
        <div style={styles.topbar}>
          <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 18 }}>←</button>
          <span style={{ color: T.fg, fontFamily: 'monospace', letterSpacing: 2, marginLeft: 8 }}>ПРОФИЛЬ</span>
        </div>
        <div style={{ ...styles.body, maxWidth: 480, textAlign: 'center', paddingTop: 40 }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: T.bg2, border: `1.5px solid ${T.fg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: T.fg2, fontFamily: 'monospace', margin: '0 auto 16px' }}>{selectedFriend.name?.[0]?.toUpperCase()}</div>
          <div style={{ color: T.fg, fontSize: 20, marginBottom: 4 }}>{selectedFriend.name}</div>
          <div style={{ color: T.fg3, fontSize: 11, fontFamily: 'monospace', letterSpacing: 2, marginBottom: 32 }}>EST · MMXXVI</div>
          {!isFriend && <button style={styles.btnp} onClick={() => sendFriendRequest(selectedFriend.uid, selectedFriend.name, selectedFriend.email)}>ДОБАВИТЬ В ДРУЗЬЯ</button>}
          {isFriend && <div style={{ color: T.fg3, fontFamily: 'monospace', letterSpacing: 2 }}>УЖЕ В ДРУЗЬЯХ</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.safe, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={styles.topbar}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Wordmark color={T.fg} size={13} /></button>
        <div style={styles.srchbar} onClick={() => setScreen('yt-search')}>
          <span style={{ color: T.fg3 }}>⊙</span>
          <span style={{ color: T.fg3, fontSize: 13, padding: '9px 0', cursor: 'pointer', flex: 1 }}>Поиск YouTube...</span>
        </div>
        <button onClick={() => setIsDark(!isDark)} style={{ background: 'none', border: 'none', color: T.fg2, cursor: 'pointer', fontSize: 18, padding: 4 }}>{isDark ? '☀' : '◑'}</button>
        <button onClick={() => setActiveTab('profile')} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative' }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: T.bg2, border: `0.5px solid ${T.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: T.fg2, fontFamily: 'monospace' }}>{user?.email?.[0]?.toUpperCase()}</div>
          {incomingRequests.length > 0 && <div style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff5555' }} />}
        </button>
      </div>

      <div style={{ flex: 1, ...styles.body }}>
        {activeTab === 'home' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={styles.seclbl}>● ПУБЛИЧНЫЕ КОМНАТЫ · {rooms.length}</span>
              <button onClick={() => setScreen('create-room')} style={{ backgroundColor: T.fg, color: T.bg, border: 'none', borderRadius: 6, padding: '5px 12px', fontFamily: 'monospace', letterSpacing: 1, cursor: 'pointer', fontSize: 10 }}>+ СОЗДАТЬ</button>
            </div>
            {rooms.length === 0 && <div style={{ textAlign: 'center', paddingTop: 60, color: T.fg3, fontFamily: 'monospace', letterSpacing: 2 }}>НЕТ АКТИВНЫХ КОМНАТ</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {rooms.map(room => (
                <div key={room.id} style={styles.card} onClick={() => { setCurrentRoom(room); setMessages([]); setIsPlaying(false); setScreen('room'); }}>
                  <div style={{ height: 110, backgroundColor: T.bg3, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <span style={{ fontSize: 28, color: T.fg3 }}>{room.source === 'youtube' ? '▶' : room.source === 'twitch' ? '◈' : '▤'}</span>
                    <div style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '2px 6px', fontSize: 9, fontFamily: 'monospace', color: '#aaa' }}>{room.source.toUpperCase()}</div>
                  </div>
                  <div style={{ padding: 12 }}>
                    <div style={{ color: T.fg, fontSize: 13, fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.title}</div>
                    <div style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>{room.host?.toUpperCase()} · {room.privacy.toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'friends' && (
          <>
            {incomingRequests.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ ...styles.seclbl, marginBottom: 12 }}>ЗАЯВКИ · {incomingRequests.length}</div>
                {incomingRequests.map(req => (
                  <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `0.5px solid ${T.border}` }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: T.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: T.fg2, fontFamily: 'monospace' }}>{req.fromName?.[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.fg, fontSize: 13, fontWeight: 500 }}>{req.fromName}</div>
                      <div style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>ХОЧЕТ ДОБАВИТЬ ВАС</div>
                    </div>
                    <button onClick={() => acceptFriendRequest(req)} style={{ backgroundColor: T.fg, color: T.bg, border: 'none', borderRadius: 6, padding: '6px 12px', fontFamily: 'monospace', cursor: 'pointer', marginRight: 6 }}>ОК</button>
                    <button onClick={() => remove(ref(db, `users/${user?.uid}/friendRequests/incoming/${req.fromUid}`))} style={{ background: 'none', border: `0.5px solid ${T.border2}`, borderRadius: 6, padding: '6px 10px', color: T.fg3, cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ ...styles.seclbl, marginBottom: 12 }}>НАЙТИ ЛЮДЕЙ</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={styles.srchbar}>
                <span style={{ color: T.fg3 }}>⊙</span>
                <input style={{ flex: 1, background: 'none', border: 'none', color: T.fg, fontSize: 14, padding: '9px 0', outline: 'none' }} placeholder="Поиск по нику или email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchUsers()} />
              </div>
              <button onClick={searchUsers} style={{ backgroundColor: T.fg, color: T.bg, border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer' }}>⊙</button>
            </div>
            {searchResults.map((u: any) => {
              const isFriend = friends.some(f => f.uid === u.uid);
              return (
                <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `0.5px solid ${T.border}`, cursor: 'pointer' }} onClick={() => { setSelectedFriend(u); setScreen('friend-profile'); }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: T.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: T.fg2, fontFamily: 'monospace' }}>{u.name?.[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.fg, fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                    <div style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>{u.email}</div>
                  </div>
                  {isFriend ? <span style={{ color: T.fg3, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>ДРУГ</span> : <button onClick={e => { e.stopPropagation(); sendFriendRequest(u.uid, u.name, u.email); }} style={{ background: 'none', border: `0.5px solid ${T.border2}`, borderRadius: 6, padding: '6px 10px', color: T.fg3, cursor: 'pointer' }}>+</button>}
                </div>
              );
            })}
            {friends.length > 0 && (
              <div style={{ marginTop: searchResults.length > 0 ? 24 : 0 }}>
                <div style={{ ...styles.seclbl, marginBottom: 12 }}>ДРУЗЬЯ · {friends.length}</div>
                {friends.map(f => (
                  <div key={f.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `0.5px solid ${T.border}`, cursor: 'pointer' }} onClick={() => { setSelectedFriend(f); setScreen('friend-profile'); }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: T.bg2, border: `1.5px solid ${T.fg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: T.fg2, fontFamily: 'monospace' }}>{f.name?.[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.fg, fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                      <div style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>ОНЛАЙН</div>
                    </div>
                    <span style={{ color: T.fg3 }}>→</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'profile' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, paddingBottom: 24, borderBottom: `0.5px solid ${T.border}` }}>
              <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: T.bg2, border: `1.5px solid ${T.fg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: T.fg2, fontFamily: 'monospace' }}>{user?.email?.[0]?.toUpperCase()}</div>
              <div>
                <div style={{ color: T.fg, fontSize: 18, marginBottom: 4 }}>{myName}</div>
                <div style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', letterSpacing: 2 }}>EST · MMXXVI</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
              {[['0', 'ЧАСОВ'], [String(friends.length), 'ДРУЗЕЙ'], ['0', 'КОМНАТ'], ['0', 'ПРОСМОТРОВ']].map(([v, k]) => (
                <div key={k} style={{ backgroundColor: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ color: T.fg, fontSize: 22, fontWeight: 500, marginBottom: 4 }}>{v}</div>
                  <div style={{ color: T.fg3, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>{k}</div>
                </div>
              ))}
            </div>
            <div style={{ ...styles.seclbl, marginBottom: 14 }}>НАСТРОЙКИ</div>
            <div style={styles.menuitem}>
              <span style={{ color: T.fg3, fontSize: 18 }}>◑</span>
              <span style={{ color: T.fg, fontSize: 14, flex: 1 }}>Тема</span>
              <button onClick={() => setIsDark(!isDark)} style={{ backgroundColor: T.fg, color: T.bg, border: 'none', borderRadius: 6, padding: '6px 14px', fontFamily: 'monospace', letterSpacing: 1, cursor: 'pointer', fontSize: 10 }}>{isDark ? 'СВЕТЛАЯ' : 'ТЁМНАЯ'}</button>
            </div>
            <div style={{ ...styles.menuitem, cursor: 'default' }}>
              <span style={{ color: T.fg3, fontSize: 18 }}>⊞</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.fg, fontSize: 14 }}>Сменить пароль</div>
              </div>
            </div>
            <input style={{ ...styles.inp, marginBottom: 10 }} type="password" placeholder="Новый пароль" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <button style={{ ...styles.btnp, marginBottom: 20 }} onClick={async () => {
              if (!newPassword || newPassword.length < 6) { alert('Минимум 6 символов'); return; }
              try { const { updatePassword: up } = await import('firebase/auth'); await up(user!, newPassword); alert('Пароль изменён'); setNewPassword(''); } catch { alert('Войди заново'); }
            }}>СОХРАНИТЬ</button>
            <div style={{ ...styles.menuitem, borderBottom: 'none', cursor: 'pointer' }} onClick={handleLogout}>
              <span style={{ color: T.fg3, fontSize: 18 }}>⊣</span>
              <span style={{ color: T.fg3, fontSize: 14 }}>Выйти</span>
            </div>
          </>
        )}
      </div>

      <div style={styles.tabbar}>
        {[{ key: 'home', label: 'ГЛАВНАЯ', icon: '⌂' }, { key: 'friends', label: 'ДРУЗЬЯ', icon: '⁋' }, { key: 'profile', label: 'ПРОФИЛЬ', icon: '◯' }].map(t => (
          <button key={t.key} style={{ ...styles.tab, color: activeTab === t.key ? T.fg : T.fg3, borderTop: activeTab === t.key ? `1px solid ${T.fg}` : '1px solid transparent', position: 'relative' }} onClick={() => setActiveTab(t.key as any)}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>{t.label}</span>
            {t.key === 'friends' && incomingRequests.length > 0 && <div style={{ position: 'absolute', top: 6, right: '30%', width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff5555' }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
