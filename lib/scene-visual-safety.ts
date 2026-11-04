/**
 * Safe storyboard framing for image requests. The novel source, analysis,
 * narration and saved scene are never modified. This is not a moderation bypass:
 * if an image provider refuses a request, that rejection is honored.
 */
export type SceneVisualPlan={moment:string;adjusted:boolean;reason?:"graphic-action"|"distressing-detail"|"intimate-content"};

const graphicAction=/\b(?:stab(?:bed|bing|s)?|impal(?:e|ed|ing)?|pierc(?:e|ed|ing)?|thrust(?:ing)?|slash(?:ed|ing)?|dismember(?:ed|ing)?|decapitat(?:e|ed|ion|ing)|behead(?:ed|ing)?|tortur(?:e|ed|ing)?|fatal blow)\b|\b(?:sword|dagger|knife|blade)\b.{0,65}\b(?:into|through|inside)\b.{0,65}\b(?:chest|neck|body|heart|flesh)\b/i;
const distressingDetail=/\b(?:gore|gory|severed limbs?|bleed(?:ing)?|blood(?:y|ied|stained)?\s+(?:wound|face|chest|hands?|clothes)|blood pouring|open wounds?|blood[- ]soaked|mutilat(?:ed|ion)|corpse|dead body|exposed organs?|entrails)\b|खून.{0,25}(?:बह|लथपथ)|रक्तरंजित|कटा हुआ सिर|क्षत-विक्षत|खुला घाव|लाश/i;
const intimateContent=/\b(?:nudity|naked|nude|sexual intercourse|graphic sex|sex act|exposed genitals|sexual assault|rape[ds]?)\b|नग्न|निर्वस्त्र|यौन|बलात्कार/i;
const violentHindi=/चाकू.{0,35}(?:मार|घोंप)|तलवार.{0,35}(?:सीन|छाती|गर्दन)|सिर.{0,15}काट|यातना/i;
const suddenPain=/\b(?:grabbed|clutched|gripped|held|pressed)\b.{0,70}\bchest\b|\b(?:chest|heart)\b.{0,50}\b(?:sharp pain|severe pain|agony)\b/i;

export function sceneNeedsVisualAdaptation(text:string):boolean{
  return graphicAction.test(text)||violentHindi.test(text)||distressingDetail.test(text)||intimateContent.test(text)||suddenPain.test(text);
}

function focalCharacter(text:string):string{
  // Prefer the person affected by the action, not the attacker or "Someone".
  const affected=text.match(/\b(?:into|through|against)\s+([A-Z][a-zA-Z]{1,35})(?:'s)?\s+(?:chest|body|heart|neck)\b/);
  if(affected)return affected[1];
  const reacting=text.match(/\b([A-Z][a-zA-Z]{1,35})\s+(?:grabbed|clutched|gripped|pressed|recoiled|staggered|gasped|shuddered)\b/);
  if(reacting)return reacting[1];
  return "the established main character";
}

/**
 * Adjust only the visual depiction when an original narrative beat explicitly
 * calls for something visually disturbing. All other scenes retain their exact
 * source moment, matching prior behavior.
 */
export function planSceneVisual(sourceText:string):SceneVisualPlan{
  const source=sourceText.trim();
  if(!sceneNeedsVisualAdaptation(source))return {moment:source,adjusted:false};
  const person=focalCharacter(source);
  if(intimateContent.test(source)){
    return {
      adjusted:true,reason:"intimate-content",
      moment:`Show a neutral, non-intimate conversation between fully clothed established characters in the established location. Preserve their original ages and identities. Use facial expression, respectful distance, naturally layered fabric and soft atmospheric lighting to express the narrative relationship. Keep the existing facial designs, costumes and full-color cinematic art direction.`
    };
  }
  if(graphicAction.test(source)||violentHindi.test(source)||distressingDetail.test(source)){
    return {
      adjusted:true,reason:graphicAction.test(source)?"graphic-action":"distressing-detail",
      moment:`A dramatic fantasy cinematic reaction shot of ${person} in the established setting, reacting to an intense confrontation taking place just beyond the camera frame. Preserve the character's identity, costume, scene geography, and emotional stakes. Frame the camera on expressions and flowing fabric, with shallow depth of field softly obscuring the distant action. Emphasize expressive body language and richly colored atmospheric lighting; the physical impact itself is not visible.`
    };
  }
  return {
    adjusted:true,reason:"distressing-detail",
    moment:`A close cinematic reaction shot of ${person} pausing and breathing tensely, resting a hand over their intact clothing. An unsettling memory is conveyed by a subtle change in expression, soft focus and shifting background light. Preserve established outfit, location, eye line and the full-color visual style.`
  };
}
