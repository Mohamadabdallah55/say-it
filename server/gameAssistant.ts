import { ThinkingLevel } from '@google/genai';
import type { ClientRole, RoomState } from '../src/game/types';
import { callGeminiContentWithFallback } from './geminiClient';
import { formatGeminiError } from './geminiHelpers';
import { roomManager } from './roomStore';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantRoomContextInput {
  roomCode?: string;
  role?: ClientRole;
  token?: string;
  phase?: string;
  activeQuestionPrompt?: string;
}

export function buildRoomContextForAssistant(params: {
  room?: RoomState;
  role?: ClientRole;
  hostVerified: boolean;
  fallbackPrompt?: string;
}): {
  contextSummary: string;
  canRevealAnswer: boolean;
} {
  const { room, role, hostVerified, fallbackPrompt } = params;
  if (!room) {
    return {
      contextSummary: fallbackPrompt
        ? `السؤال المعروض حاليًا: ${fallbackPrompt}`
        : 'المستخدم يتصفح شاشة الإعداد أو الاستوديو خارج غرفة نشطة.',
      canRevealAnswer: false,
    };
  }

  const phaseRevealed =
    room.phase === 'REVEAL' || room.phase === 'AWARD' || room.phase === 'FINAL';
  const canRevealAnswer = Boolean((role === 'host' && hostVerified) || phaseRevealed);

  const lines: string[] = [
    `المسابقة: ${room.deckTitle} (غرفة ${room.roomCode})`,
    `المرحلة الحالية: ${room.phase}`,
    `نظام اللوحة: ${
      room.boardMode === 'category_team_matrix'
        ? `مصفوفة ${room.categories.length} فئات × أسئلة مخصصة لكل فريق`
        : room.boardMode === 'team_bundles'
          ? 'حزم الفرق'
          : 'لوحة الفئات'
    }`,
    `الفرق والنقاط: ${room.teams.map((t) => `${t.name}: ${t.score} نقطة`).join(' | ')}`,
    `الدور الحالي: ${room.teams[room.currentTurnTeamIndex]?.name ?? 'غير محدد'}`,
  ];

  if (room.activeRound) {
    const q = room.activeRound.question;
    lines.push(
      `السؤال النشط الآن (${q.categoryName} · ${room.activeRound.effectivePoints} نقطة · ${q.difficulty}): ${q.prompt}`,
    );
    if (q.subtopic) {
      lines.push(`الموضوع الفرعي: ${q.subtopic}`);
    }
    if (canRevealAnswer) {
      lines.push(`الإجابة النموذجية: ${q.answer}`);
      if (q.acceptableAnswers?.length) {
        lines.push(`بدائل مقبولة: ${q.acceptableAnswers.join(' | ')}`);
      }
      if (q.explanation) {
        lines.push(`التفسير العلمي/التربوي: ${q.explanation}`);
      }
      if (q.sourceSnippet) {
        lines.push(`الدليل من النص (ص ${q.pageNumber ?? 1}): «${q.sourceSnippet}»`);
      }
    } else {
      lines.push(
        'تنبيه أمني: الإجابة الصحيحة محجوبة لأن الشاشة للجمهور/اللاعبين قبل كشف الإجابة؛ يُمنع منعًا باتًا كشف الإجابة أو التلميح لها.',
      );
    }
  } else if (fallbackPrompt) {
    lines.push(`السؤال الظاهر: ${fallbackPrompt}`);
  }

  return {
    contextSummary: lines.join('\n'),
    canRevealAnswer,
  };
}

export async function askGameAssistant(params: {
  message: string;
  history?: AssistantChatMessage[];
  roomContext?: AssistantRoomContextInput;
}): Promise<{ reply: string; canRevealAnswer: boolean }> {
  const userMessage = (params.message || '').trim();
  if (!userMessage) {
    throw new Error('يرجى كتابة سؤالك أولًا.');
  }

  const code = params.roomContext?.roomCode?.trim().toUpperCase();
  const role: ClientRole = params.roomContext?.role ?? 'projector';
  const room = code ? roomManager.getRoom(code) : undefined;
  const hostAuth =
    room && role === 'host'
      ? roomManager.verifyAccess(room.roomCode, 'host', params.roomContext?.token)
      : { allowed: false };

  const { contextSummary, canRevealAnswer } = buildRoomContextForAssistant({
    room,
    role,
    hostVerified: hostAuth.allowed,
    fallbackPrompt: params.roomContext?.activeQuestionPrompt,
  });

  const historyLines = (params.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'المستخدم' : 'نبيه'}: ${m.text}`)
    .join('\n');

  const systemInstruction = `أنت «نبيه»، المساعد والحكم الذكي الرسمي للعبة «يمكن هاي» (ELITE QUIZ SHOW).
شخصيتك: ودود، تربوي، حيادي تمامًا، دقيق وسريع البديهة، وتتكلم بالعربية الواضحة اللطيفة.

معلومات قواعد «يمكن هاي»:
1. نظام اللوحة الجديد يعتمد على 5 فئات رئيسية شاملة مستخرجة من الدرس، وداخل كل فئة 3 مستويات لكل فريق متنافس: سهل (200 نقطة)، متوسط (400 نقطة)، صعب (600 نقطة).
2. كل فريق في دوره يختار إحدى الفئات الـ 5 ومستوى (200 أو 400 أو 600) ليفتح سؤاله المخصص المتوازن مع أسئلة الفرق الأخرى.
3. وسائل المساعدة (البطاقات الخاصة):
   - «نقاط مضاعفة»: تضاعف قيمة السؤال للفريق صاحب الدور إذا أجاب صح (وتبقى للخصوم بالقيمة الأساسية إذا أتيح التحويل).
   - «الحفرة»: إذا أجاب صاحب الدور صح يكسب النقاط وتُخصم نفس القيمة من كل فريق خصم!
   - «فرصة ثانية»: تضيف +15 ثانية للوقت وتمنح محاولة إضافية.
   - «تبديل السؤال»: تستبدل السؤال بسؤال احتياطي من نفس البنك.
   - «جاوب جوابين»: تتيح اختيار إجابتين في أسئلة الاختيار من متعدد.
   - «تحدي الجرس»: تفتح السؤال للمنافسة السريعة عبر الجرس.
4. دور الحكم الذكي العادل:
   - إذا سُئلت عن قبول إجابة طالب أو خلاف تحكيمي وكان مسموحًا برؤية الإجابة، قارن إجابة الطالب بالإجابة النموذجية والتفسير المرفق، وأصدر حكمًا واضحًا: «إجابة مقبولة»، أو «مقبولة جزئيًا — يُفضّل توضيح...»، أو «غير مطابقة»، مع ذكر السبب العلمي/التربوي باختصار.
   - إذا كانت الإجابة محجوبة عن الجمهور قبل الكشف، اعتذر بلباقة ولا تلمّح للإجابة أبدًا.

سياق المباراة الحالي:
${contextSummary}`;

  const prompt = historyLines
    ? `سجل المحادثة السابق:\n${historyLines}\n\nرسالة المستخدم الحالية:\n${userMessage}`
    : userMessage;

  try {
    const reply = await callGeminiContentWithFallback({
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction,
      },
    });
    const cleanReply = (reply || '').trim();
    if (!cleanReply) {
      return {
        reply: 'أهلًا بك! لم تصلني رسالة واضحة من النموذج، أعد صياغة سؤالك وسأساعدك فورًا.',
        canRevealAnswer,
      };
    }
    return { reply: cleanReply, canRevealAnswer };
  } catch (err) {
    throw new Error(formatGeminiError(err));
  }
}
