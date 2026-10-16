import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

/**
 * Share-as-image verse card — the app twin of the web card rendered by
 * tathirquran-web/lib/verse-card.tsx (/api/verse-card/[surah]/[ayah]).
 *
 * Same layout language on both surfaces:
 *   parchment background, gold frame bars, Arabic (Uthmani) on top,
 *   translation below, surah:ayah reference, and the
 *   "TathirQuran · tathirquran.com" mark in the footer bar.
 *
 * CONTENT RULE (Shakeel, standing): all TathirQuran text/content is
 * Shia (Ithna Ashari) based. This card shows ONLY the ayah's Arabic
 * text and its translation from the existing Shia translations already
 * in Supabase. No quotations, no tafsir excerpts, no decorative
 * religious text from any outside source — the only other text on the
 * card is the surah:ayah reference and the tathirquran.com mark.
 *
 * The card is ALWAYS rendered in the illuminated (light) theme, even
 * when the app is in dark mode — a shared card is a printed artefact,
 * and the parchment/gold identity is the brand.
 *
 * Usage: render it (the Today screen keeps it off-screen), attach the
 * forwarded ref to the root View, then capture it with
 * react-native-view-shot's captureRef and share the PNG via
 * expo-sharing. Verse data comes from Supabase via lib/queries.ts —
 * nothing is hardcoded here.
 */

export interface ShareVerseCardProps {
  arabicText: string;
  translationText?: string | null;
  /** e.g. "Al-Baqara" — transliterated or English surah name */
  surahName: string;
  surahNumber: number;
  ayahNumber: number;
}

/** Design width of the card in points; captured at 3x for a 1080px PNG. */
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 450;

function arabicFontSize(text: string): number {
  const len = text?.length ?? 0;
  if (len > 260) return 20;
  if (len > 180) return 23;
  if (len > 120) return 27;
  if (len > 70) return 31;
  return 34;
}

function translationFontSize(text: string): number {
  const len = text?.length ?? 0;
  if (len > 380) return 13;
  if (len > 240) return 14.5;
  if (len > 140) return 16;
  return 17;
}

const ShareVerseCard = forwardRef<View, ShareVerseCardProps>(
  function ShareVerseCard(
    { arabicText, translationText, surahName, surahNumber, ayahNumber },
    ref
  ) {
    const fittedTranslation =
      translationText && translationText.length > 480
        ? translationText.slice(0, 480).replace(/\s+\S*$/, '') + '…'
        : translationText;

    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        {/* Top gold bar */}
        <View style={styles.goldBar} />

        {/* Inner gold frame */}
        <View pointerEvents="none" style={styles.frameOuter} />
        <View pointerEvents="none" style={styles.frameInner} />

        <View style={styles.content}>
          <Text style={styles.brand}>TATHIRQURAN</Text>

          <Text
            style={[styles.arabic, { fontSize: arabicFontSize(arabicText) }]}
          >
            {arabicText}
          </Text>

          <View style={styles.ornament}>
            <View style={styles.ornamentLine} />
            <Text style={styles.ornamentDiamond}>◆</Text>
            <View style={styles.ornamentLine} />
          </View>

          {!!fittedTranslation && (
            <Text
              style={[
                styles.translation,
                { fontSize: translationFontSize(fittedTranslation) },
              ]}
            >
              {`"${fittedTranslation}"`}
            </Text>
          )}

          <Text style={styles.ref}>
            {surahName.toUpperCase()} {surahNumber}:{ayahNumber}
          </Text>
        </View>

        {/* Bottom gold bar with domain mark */}
        <View style={styles.footerBar}>
          <Text style={styles.footerText}>TATHIRQURAN · TATHIRQURAN.COM</Text>
        </View>
      </View>
    );
  }
);

export default ShareVerseCard;

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: Colors.parchment,
    flexDirection: 'column',
    position: 'relative',
  },
  goldBar: {
    height: 7,
    width: '100%',
    backgroundColor: Colors.bronze,
  },
  frameOuter: {
    position: 'absolute',
    top: 15,
    left: 12,
    right: 12,
    bottom: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,39,0.45)',
  },
  frameInner: {
    position: 'absolute',
    top: 19,
    left: 16,
    right: 16,
    bottom: 19,
    borderWidth: 0.5,
    borderColor: 'rgba(201,162,39,0.25)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 20,
  },
  brand: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 4,
    color: Colors.bronze,
    marginBottom: 18,
  },
  arabic: {
    fontFamily: 'Amiri_700Bold',
    color: Colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 52,
    marginBottom: 12,
  },
  ornament: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  ornamentLine: {
    width: 26,
    height: 0.5,
    backgroundColor: 'rgba(201,162,39,0.5)',
  },
  ornamentDiamond: { fontSize: 7, color: Colors.bronze },
  translation: {
    fontFamily: 'Amiri_400Regular',
    fontStyle: 'italic',
    color: Colors.inkMid,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 14,
  },
  ref: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2.5,
    color: Colors.bronze,
    marginBottom: 3,
  },
  footerBar: {
    height: 19,
    width: '100%',
    backgroundColor: Colors.bronze,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 8,
    letterSpacing: 2.5,
    color: '#1a1005',
  },
});
