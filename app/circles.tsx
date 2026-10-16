import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../lib/theme';
import { getTodayAyah } from '../lib/queries';
import { localToday } from '../lib/streaks';
import {
  CirclesApiError,
  clearMembership,
  createCircle,
  fetchCircleToday,
  joinCircle,
  loadMembership,
  type CircleMembership,
  type CircleToday,
} from '../lib/circles';

/**
 * Family circle — read the daily verse together, gently.
 *
 * One circle per device in this minimal version. Members see each
 * other's display names and who has read today's verse — nothing is
 * ranked, counted against anyone, or compared. There is no account:
 * identity is this device's random UUID (lib/device.ts) and the
 * circle is guarded only by its invite code, which the privacy note
 * below states plainly in the UI, not just in the code.
 */

const PRIVACY_NOTE =
  'No account, no email. A circle is guarded only by its invite code: anyone who has the code can join and see members\u2019 display names and who has read today\u2019s verse. Share the code only with family and people you trust, like a house key.';

const UNAVAILABLE_MESSAGE =
  'Circles aren\u2019t available yet. The circle service has not been switched on — please try again soon.';

export default function CirclesScreen() {
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<CircleMembership | null>(null);
  const [today, setToday] = useState<CircleToday | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verseRef, setVerseRef] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [circleName, setCircleName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const load = useCallback(async () => {
    const m = await loadMembership();
    setMembership(m);
    if (!m) {
      setToday(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    // Today's verse reference comes from the same read Today uses;
    // it is best-effort display only.
    getTodayAyah()
      .then((a) => {
        if (a) {
          const name = a.surahs?.name_english;
          setVerseRef(
            name
              ? `${name} · ${a.surah_number}:${a.ayah_number}`
              : `${a.surah_number}:${a.ayah_number}`
          );
        }
      })
      .catch(() => {});
    try {
      const t = await fetchCircleToday(m.circle_id, localToday());
      setToday(t);
      setLoadError(null);
    } catch (e) {
      setToday(null);
      setLoadError(
        e instanceof CirclesApiError && !e.unavailable
          ? e.message
          : UNAVAILABLE_MESSAGE
      );
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const formFail = (e: unknown) => {
    setFormError(
      e instanceof CirclesApiError && !e.unavailable ? e.message : UNAVAILABLE_MESSAGE
    );
  };

  const handleCreate = async () => {
    if (busy) return;
    if (!displayName.trim()) {
      setFormError('Please enter your display name — it is how your circle will see you.');
      return;
    }
    if (!circleName.trim()) {
      setFormError('Please give your circle a name, e.g. your family name.');
      return;
    }
    setBusy('create');
    setFormError(null);
    try {
      const m = await createCircle(circleName, displayName);
      setMembership(m);
      await load();
    } catch (e) {
      formFail(e);
    } finally {
      setBusy(null);
    }
  };

  const handleJoin = async () => {
    if (busy) return;
    if (!displayName.trim()) {
      setFormError('Please enter your display name — it is how your circle will see you.');
      return;
    }
    if (!inviteCode.trim()) {
      setFormError('Please enter the invite code you were given.');
      return;
    }
    setBusy('join');
    setFormError(null);
    try {
      const m = await joinCircle(inviteCode, displayName);
      setMembership(m);
      await load();
    } catch (e) {
      formFail(e);
    } finally {
      setBusy(null);
    }
  };

  const handleShareCode = async () => {
    if (!membership) return;
    await Share.share({
      message:
        `Join our family circle on TathirQuran and read the daily verse together. ` +
        `Open the app, tap Circle, choose Join, and enter this invite code: ${membership.invite_code}`,
    });
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave this circle?',
      'This removes the circle from this device only. Your display name and the days you have read stay in the circle\u2019s history — there is no way to remove them from here.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave circle',
          style: 'destructive',
          onPress: async () => {
            await clearMembership();
            setMembership(null);
            setToday(null);
            setLoadError(null);
          },
        },
      ]
    );
  };

  const s = makeStyles(theme);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.goldBar} />
        <View style={s.centered}>
          <ActivityIndicator color={theme.bronze} />
        </View>
        <View style={s.goldBar} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.goldBar} />
      <View style={s.header}>
        <Text style={s.headerTitle}>FAMILY CIRCLE</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {!membership ? (
          <>
            <Text style={s.intro}>
              Read the daily verse together with your family. Each day, your
              circle can see who has read — a gentle encouragement, never a
              score.
            </Text>

            <Text style={s.label}>YOUR DISPLAY NAME</Text>
            <TextInput
              style={s.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Ammi, Baba, Maryam"
              placeholderTextColor={theme.textSecondary}
              maxLength={40}
              autoCorrect={false}
            />

            <Text style={s.sectionHeader}>CREATE A CIRCLE</Text>
            <TextInput
              style={s.input}
              value={circleName}
              onChangeText={setCircleName}
              placeholder="Circle name, e.g. The Khan Family"
              placeholderTextColor={theme.textSecondary}
              maxLength={60}
            />
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: theme.bronze }]}
              onPress={handleCreate}
              activeOpacity={0.8}
              disabled={busy !== null}
            >
              <Text style={s.primaryBtnText}>
                {busy === 'create' ? 'CREATING…' : 'CREATE CIRCLE'}
              </Text>
            </TouchableOpacity>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or</Text>
              <View style={s.dividerLine} />
            </View>

            <Text style={s.sectionHeader}>JOIN WITH AN INVITE CODE</Text>
            <TextInput
              style={[s.input, s.codeInput]}
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              placeholder="Invite code"
              placeholderTextColor={theme.textSecondary}
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: theme.bronze }]}
              onPress={handleJoin}
              activeOpacity={0.8}
              disabled={busy !== null}
            >
              <Text style={s.primaryBtnText}>
                {busy === 'join' ? 'JOINING…' : 'JOIN CIRCLE'}
              </Text>
            </TouchableOpacity>

            {formError && <Text style={s.errorText}>{formError}</Text>}

            <View style={s.noteBox}>
              <Text style={s.noteText}>{PRIVACY_NOTE}</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={s.circleName}>{membership.name}</Text>

            {verseRef && (
              <Text style={s.verseRef}>Today&rsquo;s verse — {verseRef}</Text>
            )}

            <View style={s.codeBox}>
              <Text style={s.codeLabel}>INVITE CODE — SHARE WITH FAMILY</Text>
              <Text style={s.codeText} selectable>
                {today?.invite_code ?? membership.invite_code}
              </Text>
              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: theme.border }]}
                onPress={handleShareCode}
                activeOpacity={0.7}
              >
                <Text style={[s.secondaryBtnText, { color: theme.bronze }]}>
                  SHARE INVITE CODE
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionHeader}>TODAY</Text>

            {today ? (
              <>
                {today.members.map((member, i) => (
                  <View key={`${member.display_name}-${i}`} style={s.memberRow}>
                    <Text style={s.memberName}>
                      {member.display_name}
                      {member.is_you ? ' (you)' : ''}
                    </Text>
                    <Text
                      style={[
                        s.memberStatus,
                        { color: member.checked_in ? theme.bronze : theme.textSecondary },
                      ]}
                    >
                      {member.checked_in ? 'has read today\u2019s verse \u2713' : 'not yet'}
                    </Text>
                  </View>
                ))}
                <Text style={s.footnote}>
                  Opening the Today screen marks you as having read that
                  day&rsquo;s verse. &ldquo;Not yet&rdquo; only means the verse
                  hasn&rsquo;t been opened today — nothing more.
                </Text>
              </>
            ) : (
              <View style={s.noteBox}>
                <Text style={s.noteText}>
                  {loadError ?? UNAVAILABLE_MESSAGE}
                </Text>
                <TouchableOpacity
                  style={[s.secondaryBtn, { borderColor: theme.border, alignSelf: 'flex-start' }]}
                  onPress={() => void load()}
                  activeOpacity={0.7}
                >
                  <Text style={[s.secondaryBtnText, { color: theme.bronze }]}>TRY AGAIN</Text>
                </TouchableOpacity>
              </View>
            )}

            {today && (
              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: theme.border, alignSelf: 'flex-start' }]}
                onPress={() => void load()}
                activeOpacity={0.7}
              >
                <Text style={[s.secondaryBtnText, { color: theme.bronze }]}>↻ REFRESH</Text>
              </TouchableOpacity>
            )}

            <View style={s.noteBox}>
              <Text style={s.noteText}>{PRIVACY_NOTE}</Text>
            </View>

            <TouchableOpacity onPress={handleLeave} activeOpacity={0.7} style={s.leaveBtn}>
              <Text style={s.leaveText}>Leave circle</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <View style={s.goldBar} />
    </SafeAreaView>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    goldBar: { height: 4, backgroundColor: theme.bronze },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 3,
      color: theme.gold,
      textAlign: 'center',
    },
    scroll: { padding: 24 },
    intro: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 15,
      fontStyle: 'italic',
      lineHeight: 22,
      color: theme.text,
      textAlign: 'center',
      marginBottom: 20,
    },
    label: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 2,
      color: theme.gold,
      marginBottom: 6,
    },
    sectionHeader: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 2,
      color: theme.gold,
      marginTop: 22,
      marginBottom: 10,
    },
    input: {
      borderWidth: 0.5,
      borderColor: theme.border,
      backgroundColor: theme.bgCard,
      borderRadius: 2,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontFamily: 'Amiri_400Regular',
      fontSize: 15,
      color: theme.text,
      marginBottom: 12,
    },
    codeInput: { letterSpacing: 3 },
    primaryBtn: {
      borderRadius: 2,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      letterSpacing: 2,
      color: '#fff',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 26,
    },
    dividerLine: { flex: 1, height: 0.5, backgroundColor: theme.border },
    dividerText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12,
      fontStyle: 'italic',
      color: theme.textSecondary,
    },
    errorText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      lineHeight: 19,
      color: '#a33b2e',
      marginTop: 16,
    },
    noteBox: {
      borderWidth: 0.5,
      borderColor: theme.border,
      borderRadius: 2,
      padding: 14,
      marginTop: 22,
      gap: 10,
    },
    noteText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12.5,
      fontStyle: 'italic',
      lineHeight: 18,
      color: theme.textSecondary,
    },
    circleName: {
      fontFamily: 'Amiri_700Bold',
      fontSize: 22,
      color: theme.text,
      textAlign: 'center',
    },
    verseRef: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      letterSpacing: 1,
      color: theme.gold,
      textAlign: 'center',
      marginTop: 6,
    },
    codeBox: {
      alignItems: 'center',
      borderWidth: 0.5,
      borderColor: theme.border,
      borderRadius: 2,
      padding: 16,
      marginTop: 20,
      gap: 8,
    },
    codeLabel: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 9,
      letterSpacing: 2,
      color: theme.textSecondary,
    },
    codeText: {
      fontFamily: 'Amiri_700Bold',
      fontSize: 26,
      letterSpacing: 6,
      color: theme.text,
    },
    secondaryBtn: {
      borderWidth: 0.5,
      borderRadius: 2,
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginTop: 6,
    },
    secondaryBtnText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 2,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
      gap: 12,
    },
    memberName: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 15,
      color: theme.text,
      flexShrink: 1,
    },
    memberStatus: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12.5,
      fontStyle: 'italic',
      textAlign: 'right',
    },
    footnote: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12,
      fontStyle: 'italic',
      lineHeight: 17,
      color: theme.textSecondary,
      marginTop: 12,
    },
    leaveBtn: { alignSelf: 'center', marginTop: 26, padding: 8 },
    leaveText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12.5,
      color: '#a33b2e',
      letterSpacing: 0.5,
    },
  });
}
