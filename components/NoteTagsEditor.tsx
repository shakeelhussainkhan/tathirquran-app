import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { getNoteAndTags, saveNote, saveTags, deleteNote } from '../lib/notes';
import type { Theme } from '../lib/theme';

interface Props {
  surah: number;
  ayah: number;
  theme: Theme;
  /** Called after a save/delete so parents (e.g. Archive) can refresh lists. */
  onChanged?: () => void;
}

/**
 * Add / edit a personal note and manage tags for one ayah.
 * Everything is stored locally on the device only (see lib/notes.ts) —
 * notes never leave the device. No bundled sample notes or tags.
 */
export default function NoteTagsEditor({ surah, ayah, theme, onChanged }: Props) {
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    getNoteAndTags(surah, ayah).then(({ note: n, tags: t }) => {
      if (cancelled) return;
      setNote(n);
      setSavedNote(n);
      setTags(t);
      setTagDraft('');
      setStatus('');
    });
    return () => { cancelled = true; };
  }, [surah, ayah]);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2000);
  };

  const handleSaveNote = async () => {
    await saveNote(surah, ayah, note);
    const clean = note.trim();
    setNote(clean);
    setSavedNote(clean);
    flash(clean ? 'Note saved on this device' : 'Note removed');
    onChanged?.();
  };

  const handleDeleteNote = async () => {
    await deleteNote(surah, ayah);
    setNote('');
    setSavedNote('');
    flash('Note removed');
    onChanged?.();
  };

  const addTag = async () => {
    const clean = tagDraft.trim();
    if (!clean) return;
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setTagDraft('');
      return;
    }
    const next = [...tags, clean];
    setTags(next);
    setTagDraft('');
    await saveTags(surah, ayah, next);
    onChanged?.();
  };

  const removeTag = async (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    await saveTags(surah, ayah, next);
    onChanged?.();
  };

  const dirty = note.trim() !== savedNote;

  return (
    <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
      <Text style={[styles.heading, { color: theme.bronze }]}>MY NOTE</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        value={note}
        onChangeText={setNote}
        placeholder="Write your own note on this ayah…"
        placeholderTextColor={theme.textSecondary}
        multiline
        textAlignVertical="top"
      />
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, { borderColor: theme.border }]}
          onPress={handleSaveNote}
          disabled={!dirty}
          activeOpacity={0.7}
        >
          <Text style={[styles.btnText, { color: dirty ? theme.bronze : theme.textSecondary }]}>
            {savedNote ? 'SAVE NOTE' : 'ADD NOTE'}
          </Text>
        </TouchableOpacity>
        {savedNote ? (
          <TouchableOpacity style={[styles.btn, { borderColor: theme.border }]} onPress={handleDeleteNote} activeOpacity={0.7}>
            <Text style={[styles.btnText, { color: theme.textSecondary }]}>DELETE</Text>
          </TouchableOpacity>
        ) : null}
        {status ? <Text style={[styles.status, { color: theme.goldText }]}>{status}</Text> : null}
      </View>

      <Text style={[styles.heading, { color: theme.bronze, marginTop: 14 }]}>TAGS</Text>
      {tags.length > 0 && (
        <View style={styles.chipRow}>
          {tags.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[styles.chip, { borderColor: theme.border }]}
              onPress={() => removeTag(tag)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>{tag} ×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.tagInputRow}>
        <TextInput
          style={[styles.tagInput, { color: theme.text, borderColor: theme.border }]}
          value={tagDraft}
          onChangeText={setTagDraft}
          placeholder="Add a tag"
          placeholderTextColor={theme.textSecondary}
          onSubmitEditing={addTag}
          returnKeyType="done"
        />
        <TouchableOpacity style={[styles.btn, { borderColor: theme.border }]} onPress={addTag} activeOpacity={0.7}>
          <Text style={[styles.btnText, { color: theme.bronze }]}>ADD TAG</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.privacy, { color: theme.textSecondary }]}>
        Your notes and tags are stored only on this device and never leave it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderWidth: 0.5,
    borderRadius: 4,
    padding: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  heading: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  input: {
    borderWidth: 0.5,
    borderRadius: 2,
    padding: 10,
    minHeight: 64,
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  btn: { borderWidth: 0.5, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 2 },
  btnText: { fontSize: 11, letterSpacing: 2, fontFamily: 'Amiri_400Regular' },
  status: { fontFamily: 'Amiri_400Regular', fontSize: 11, fontStyle: 'italic' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderWidth: 0.5, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 10 },
  chipText: { fontFamily: 'Amiri_400Regular', fontSize: 12 },
  tagInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tagInput: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: 2,
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
  },
  privacy: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 10,
  },
});
