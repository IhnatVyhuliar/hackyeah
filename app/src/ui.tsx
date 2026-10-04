import React from 'react';
import { Text, View, Pressable, Linking, ScrollView, TextInput, Image, StyleSheet } from 'react-native';
import * as Lucide from 'lucide-react-native';
import { col, F, PH, LINE, LINE_STRONG } from './theme';

export const ev = (t: string) => ({ target: { value: t } });
export const open = (u?: string) => { if (u && u !== '#') Linking.openURL(u); };

export function Txt({ s = 15, w = 400, c = 'var(--fg-1)', mono, up, ls, lh, center, style, children, numberOfLines }: any) {
  const fam = mono ? F.mono : F.sans;
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: fam[w] || fam[400], fontSize: s, color: col(c), lineHeight: lh ? Math.round(s * lh) : undefined, letterSpacing: ls, textTransform: up ? 'uppercase' : 'none', textAlign: center ? 'center' : undefined }, style]}>
      {children}
    </Text>
  );
}
export const Label = ({ children, c, style }: any) => <Txt mono s={12} w={500} up ls={0.7} c={c || 'var(--fg-3)'} style={style}>{children}</Txt>;
export const Wordmark = ({ s = 24 }: any) => <Txt s={s} w={700} ls={-s * 0.03}>Sellsor<Txt s={s} w={700} c="var(--secured)">.</Txt></Txt>;

const pascal = (n: string) => n.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
export function Icon({ name, size = 18, color = 'var(--fg-1)' }: any) {
  const Cmp = (Lucide as any)[pascal(name)] || (Lucide as any).Circle;
  return <Cmp size={size} color={col(color)} strokeWidth={1.75} />;
}
export const Dot = ({ c, s = 7 }: any) => <View style={{ width: s, height: s, borderRadius: s, backgroundColor: col(c) }} />;

const KINDS: Record<string, { bg: string; fg: string; bd: string; bw: number }> = {
  primary: { bg: 'var(--accent)', fg: '#FFFFFF', bd: 'transparent', bw: 1 },
  secondary: { bg: 'var(--surface-2)', fg: 'var(--fg-1)', bd: 'transparent', bw: 1 },
  outline: { bg: 'transparent', fg: 'var(--fg-1)', bd: 'var(--line-strong)', bw: 1 },
  strong: { bg: 'transparent', fg: 'var(--fg-1)', bd: 'var(--fg-1)', bw: 2 },
  mint: { bg: 'var(--mint-500)', fg: 'var(--ink-950)', bd: 'transparent', bw: 2 },
  warn: { bg: 'transparent', fg: 'var(--warning)', bd: 'var(--warning)', bw: 2 },
  ghost: { bg: 'transparent', fg: 'var(--fg-2)', bd: 'transparent', bw: 1 },
};
export function Btn({ label, onPress, kind = 'primary', icon, disabled, h = 56, s = 17, w = 600, style }: any) {
  const k = KINDS[kind];
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={({ pressed }) => [{ height: h, borderRadius: 999, borderWidth: k.bw, borderColor: col(k.bd), backgroundColor: col(k.bg), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed && !disabled ? 0.98 : 1 }] }, style]}>
      {icon ? <Icon name={icon} size={18} color={k.fg} /> : null}
      <Txt s={s} w={w} c={k.fg}>{label}</Txt>
    </Pressable>
  );
}
export const Chip = ({ c, h = 36, bw = 1 }: any) => (
  <Pressable onPress={c.pick} style={{ height: h, paddingHorizontal: 14, borderRadius: 999, borderWidth: bw, borderColor: col(c.border), backgroundColor: col(c.bg), justifyContent: 'center' }}>
    <Txt s={14} w={500} c={c.fg}>{c.label}</Txt>
  </Pressable>
);
export function Notice({ tone = 'var(--line-strong)', icon, iconColor, title, text, bw = 1, children }: any) {
  return (
    <View style={{ borderWidth: bw, borderColor: col(tone), borderRadius: 8, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {icon ? <View style={{ marginTop: 1 }}><Icon name={icon} size={20} color={iconColor || tone} /></View> : null}
        <View style={{ flex: 1, gap: 6 }}>
          {title ? <Txt s={17} w={600} lh={1.2}>{title}</Txt> : null}
          {text ? <Txt s={15} c="var(--fg-2)" lh={1.45}>{text}</Txt> : null}
        </View>
      </View>
      {children}
    </View>
  );
}
// `src` = bundled image (require), `uri` = listing photo from server media. Sized explicitly: react-native-web otherwise uses the asset's pixel size.
export const FILL = [StyleSheet.absoluteFill, { width: '100%', height: '100%' }] as any;
export const Photo = ({ h, w, label, src, uri, style }: any) => {
  const img = src ?? (uri ? { uri } : null);
  return (
    <View style={[{ height: h, width: w, borderRadius: 4, backgroundColor: '#17171D', borderWidth: 1, borderColor: '#1B1B22', overflow: 'hidden' }, style]}>
      {img ? <Image source={img} resizeMode="cover" style={FILL} /> : null}
      {label ? <Txt mono s={11} up ls={0.4} c={img ? '#F4F4F6' : 'var(--ink-400)'} style={[{ position: 'absolute', left: 10, bottom: 10 }, img && { backgroundColor: 'rgba(5,5,7,0.72)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 }]}>{label}</Txt> : null}
    </View>
  );
};
export function Header({ title, onBack, right }: any) {
  return (
    <View style={{ height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {onBack ? <Pressable onPress={onBack} hitSlop={8} style={{ width: 44, height: 44, marginLeft: -8, justifyContent: 'center' }}><Icon name="chevron-left" size={26} /></Pressable> : null}
      <Txt s={20} w={600} style={{ flex: 1 }}>{title}</Txt>
      {right}
    </View>
  );
}
export const Body = ({ children, gap = 16, pt = 4 }: any) => (
  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: pt, paddingBottom: 16, gap }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
);
export const Footer = ({ children, border, gap = 12, center }: any) => (
  <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap, borderTopWidth: border ? 1 : 0, borderTopColor: LINE, alignItems: center ? 'center' : 'stretch' }}>{children}</View>
);
export const ExplorerLink = ({ href, label = 'Zobacz w Solana Explorer', strong }: any) => (
  <Pressable onPress={() => open(href)} style={{ minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
    <Txt s={strong ? 15 : 14} w={strong ? 600 : 400} c={strong ? 'var(--fg-1)' : 'var(--fg-2)'} style={{ textDecorationLine: 'underline' }}>{label}</Txt>
    <Icon name="external-link" size={14} color={strong ? 'var(--fg-1)' : 'var(--fg-2)'} />
  </Pressable>
);
export function Field({ label, value, onChangeText, placeholder, mono, suffix, keyboardType, secure, multiline, h = 50, style }: any) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <View style={{ minHeight: h, borderWidth: 1, borderColor: LINE_STRONG, borderRadius: 4, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}>
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={PH} keyboardType={keyboardType} autoCorrect={false}
          secureTextEntry={secure} multiline={multiline} autoCapitalize={secure || keyboardType === 'email-address' ? 'none' : undefined} accessibilityLabel={label || placeholder}
          style={{ flex: 1, color: col('var(--fg-1)'), fontFamily: (mono ? F.mono : F.sans)[400], fontSize: 16, paddingVertical: multiline ? 10 : 0, minHeight: multiline ? h : undefined, textAlignVertical: multiline ? 'top' : 'center' }} />
        {suffix ? <Txt mono s={14} c="var(--fg-3)">{suffix}</Txt> : null}
      </View>
    </View>
  );
}
export const Row = ({ children, gap = 8, style, center = true }: any) => <View style={[{ flexDirection: 'row', alignItems: center ? 'center' : 'flex-start', gap }, style]}>{children}</View>;
export const KV = ({ k, v, vc = 'var(--fg-1)', last }: any) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: LINE }}>
    <Txt s={15} c="var(--fg-2)" style={{ flex: 1 }}>{k}</Txt>{typeof v === 'string' ? <Txt mono s={15} c={vc}>{v}</Txt> : v}
  </View>
);
