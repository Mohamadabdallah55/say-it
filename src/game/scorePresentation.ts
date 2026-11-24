// Measured from the reference recording, then adapted to our local scene.
export const SCORE_INTRO_MS=420;
export const SCORE_CARD_MS=1550;
export const SCORE_OUTRO_MS=300;
export const scoreDuration=(count:number)=>SCORE_INTRO_MS+Math.min(4,count)*SCORE_CARD_MS+SCORE_OUTRO_MS;
