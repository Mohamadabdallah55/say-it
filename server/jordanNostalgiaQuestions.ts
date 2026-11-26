import { difficultyForPoints } from '../src/game/pdfValidation';
import { JORDAN_NOSTALGIA_CATEGORY } from '../src/game/jordanNostalgia';
import type { PointValue, QuizQuestion } from '../src/game/types';
import dataset from './jordanNostalgiaQuestions.json';

export interface JordanNostalgiaImageMeta {
  url: string | null;
  localFile: string | null;
  status: 'verified_and_licensed' | 'needs_manual_asset' | string;
  searchQueryAr: string;
  googleImagesSearchUrl: string;
  visualTarget: string;
  imageSelectionInstructions: string;
  mustBeRealPhoto: boolean;
  rejectIf: string[];
  displayGuidance: string;
  sourcePage: string | null;
  sourcePublisher: string | null;
  license: string | null;
  width?: number;
  height?: number;
  flickrTitle?: string;
}

export interface JordanNostalgiaQuestionRow {
  id: string;
  category: string;
  region: string;
  subCategory: string;
  difficulty: number;
  points: number;
  question: string;
  answer: string;
  acceptedAnswers: string[];
  imageRequired: boolean;
  videoUrl?: string;
  videoSourceUrl?: string;
  videoReviewStatus?: string;
  image: JordanNostalgiaImageMeta | null;
  evidenceUrls: string[];
  rightsStatus: 'verified_for_publication' | 'not_verified' | string;
  contentStatus: 'approved' | 'needs_manual_asset' | string;
  reviewNotes: string;
  questionType: string;
  tags: string[];
}

interface JordanNostalgiaDataset {
  schemaVersion: string;
  category_id: string;
  title: string;
  locale: string;
  questionCount: number;
  total_source_questions: number;
  verified_playable_count: number;
  needs_manual_asset_count: number;
  levels: Record<string, number>;
  points_distribution_playable: Record<string, number>;
  questions: JordanNostalgiaQuestionRow[];
}

const typedDataset = dataset as JordanNostalgiaDataset;

export const JORDAN_NOSTALGIA_ALL_ROWS: JordanNostalgiaQuestionRow[] = [...typedDataset.questions];

function isVerifiedPlayableRow(row: JordanNostalgiaQuestionRow): boolean {
  if (row.contentStatus === 'approved' && row.rightsStatus === 'public_domain_source' &&
      typeof row.videoUrl === 'string' &&
      /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(row.videoUrl) &&
      row.videoSourceUrl?.startsWith('https://commons.wikimedia.org/')) return true;
  // Nostalgia is a visual category. Keep text-only rows in the source bank until they have a matching image.
  if (!row.imageRequired || !row.image || !(row.image.localFile || row.image.url)) return false;
  if (row.contentStatus === 'approved' &&
      row.rightsStatus === 'external_reference_unconfirmed' &&
      row.image?.status === 'external_reference' &&
      typeof row.image.url === 'string' &&
      /^https:\/\/(?:2\.bp\.blogspot\.com|archivio-gamesurf\.tiscali\.it|assets\.funnygames\.org|assets\.indogamers\.com|cdn\.download-free-games\.com|cdn\.mobygames\.com|cdn\.mos\.cms\.futurecdn\.net|cdn\.nichesites\.pikoya\.com|cdn\.shopify\.com|cdn\.spacetoongo\.com|cdn\.thegamesdb\.net|cimg\.kgl-systems\.io|d1okbxqf70pew6\.cloudfront\.net|d2j6dbq0eux0bg\.cloudfront\.net|d38vousazc6cao\.cloudfront\.net|down-id\.img\.susercontent\.com|eiga-pop\.com|fingersoft\.com|gamefabrique\.com|i\.ebayimg\.com|i\.insider\.com|i\.pinimg\.com|i0\.wp\.com|i1\.sndcdn\.com|image\.tmdb\.org|images\.igdb\.com|images\.launchbox-app\.com|images\.shopcdn\.co\.uk|images\.squarespace-cdn\.com|img\.bhs4\.com|img\.chilango\.com|imgrosetta\.webtekno\.com|jrsy\.tmsimg\.com|lassaho\.weebly\.com|livedoor\.blogimg\.jp|m\.media-amazon\.com|maxsmile\.in|media\.giphy\.com|media\.whichcar\.com\.au|pbs\.twimg\.com|retromagaz\.com|s\.pacn\.ws|s1\.dmcdn\.net|s2\.dmcdn\.net|s2\.glbimg\.com|s3-eu-west-1\.amazonaws\.com|shared\.akamai\.steamstatic\.com|static\.10doigts\.fr|static\.toiimg\.com|static\.wikia\.nocookie\.net|www\.allphones\.com\.au|www\.allthetests\.com|www\.atmhtml5games\.com|www\.flipline\.com|www\.gamekarma\.com|www\.gamershouse\.cz|www\.hlj\.com|www\.macgamestore\.com|www\.pomu\.com|www\.ranksarabia\.com|www\.shopico\.rs|www\.sify\.com|www\.thisisamman\.com)\//.test(row.image.url) &&
      row.image.sourcePage?.startsWith('https://')) return true;
  return (
    row.contentStatus === 'approved' &&
    row.rightsStatus === 'verified_for_publication' &&
    row.image?.status === 'verified_and_licensed' &&
    typeof row.image.localFile === 'string' &&
    row.image.localFile.startsWith('/assets/jordan_nostalgia/') &&
    typeof row.image.sourcePage === 'string' &&
    row.image.sourcePage.startsWith('https://') &&
    !/wikipedia\.org|wikimedia\.org/i.test(row.image.sourcePage) &&
    !/wikipedia\.org|wikimedia\.org/i.test(row.image.url ?? '')
  );
}

export const JORDAN_NOSTALGIA_QUESTIONS: QuizQuestion[] = JORDAN_NOSTALGIA_ALL_ROWS
  .filter(isVerifiedPlayableRow)
  .map((row) => {
    const points = (
      row.points === 200 || row.points === 400 || row.points === 600 ? row.points : 400
    ) as PointValue;

    const attribution = [row.image?.sourcePublisher?.trim(), row.image?.license?.trim()]
      .filter(Boolean)
      .join(' · ');
    const explanationParts = [
      row.subCategory?.trim(),
      attribution ? `الصورة: ${attribution}` : '',
    ].filter(Boolean);

    const uniqueAcceptedAnswers = Array.from(
      new Set([row.answer, ...(row.acceptedAnswers ?? [])].map((item) => item.trim()).filter(Boolean)),
    );

    return {
      id: row.id,
      categoryId: JORDAN_NOSTALGIA_CATEGORY.id,
      categoryName: JORDAN_NOSTALGIA_CATEGORY.name,
      questionType: 'direct_qa',
      difficulty: difficultyForPoints(points),
      points,
      prompt: row.question,
      answer: row.answer,
      acceptableAnswers: uniqueAcceptedAnswers,
      imageUrl: row.image?.localFile ?? row.image?.url ?? undefined,
      videoUrl: typeof row.videoUrl === 'string' && /^https:\/\/(?:video\.fastly\.steamstatic\.com\/store_trailers\/|media\.giphy\.com\/media\/|upload\.wikimedia\.org\/wikipedia\/commons\/)/.test(row.videoUrl) ? row.videoUrl : undefined,
      imageDisplay: row.image ? 'before_reveal' : undefined,
      imageSourceUrl: row.image?.sourcePage ?? undefined,
      subtopic: row.subCategory,
      explanation: explanationParts.join(' — '),
      sourceRef: row.videoSourceUrl ?? row.image?.sourcePage ?? row.evidenceUrls?.[0],
      verificationStatus: row.image?.status === 'verified_and_licensed' ? 'verified' : undefined,
      status: 'approved',
    };
  });
