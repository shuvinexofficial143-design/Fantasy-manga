// Visual-only adaptation: the original story, narration and analyzed scenes stay unchanged.
// This does not disable provider moderation or automatically retry a rejected request.
export function nonGraphicVisualBeat(sourceText:string):string{
  const source=sourceText.trim();
  const nameFromChest=source.match(/\b(?:into|in|at|over|against)\s+([A-Z][a-z]+)(?:'s)?\s+chest\b/);
  const namedSubject=nameFromChest?.[1]||source.match(/\b([A-Z][a-z]+)\s+(?:grabbed|clutched|held|pressed|staggered|recoiled)\b/)?.[1];
  const person=namedSubject||"the established character";

  if(/\b(?:grabbed|clutched|held|pressed)\b[^.?!]{0,80}\bchest\b|\bchest\b[^.?!]{0,40}\bpain\b/i.test(source)){
    return `Cinematic reaction shot of ${person} pressing a hand gently over the front of their clothing and taking a tense breath. Their expression conveys a sudden unsettling memory. The surroundings softly dissolve into light and shadow, continuing the established lighting and camera direction. Focus on the face, intact clothing and atmosphere.`;
  }
  if(/\b(?:sword|dagger|blade|knife|stab(?:bed|bing)?|thrust(?:ing)?|pierc(?:ed|ing)?|impal(?:ed|ing)?|fatal blow|killed|slain|murder)\b/i.test(source)){
    return `Cinematic dramatic aftermath of an unseen confrontation involving ${person}. Show ${person}'s startled facial expression and the distant silhouette of an opponent, with an ornate weapon held away from all bodies. Suggest the story's turning point through composition, lighting and reaction rather than physical contact. No visible strike, wound, blood, penetration or graphic imagery.`;
  }
  if(/\b(?:bleed|blood|gore|wound|corpse|dismember|severed|tortur)\b/i.test(source)){
    return `Cinematic, non-graphic emotional aftermath: focus on the established characters' reactions, dramatic silence, environment and lighting. Imply that something grave happened off-screen without showing bodily harm, injuries or disturbing details. Match the surrounding film's character design and camera geography.`;
  }
  // For a provider-blocked, otherwise neutral beat, the text itself remains intact.
  return `Cinematic, non-graphic depiction: ${source}. Emphasize expressions, natural gestures, atmosphere and indirect storytelling. Show intact costumes and peaceful background details.`;
}

/**
 * Use a non-graphic shot from the outset for clearly depicted bodily violence.
 * This is a creative framing choice, not a retry after the provider has rejected
 * the request; rejected scenes still require an explicit user action.
 */
export function shouldStartNonGraphic(sourceText:string):boolean{
  return /\b(?:stab(?:bed|bing)?|impal(?:e|ed|ing)|pierc(?:e|ed|ing)|thrust|dismember(?:ed|ing)?|sever(?:ed|ing)?|tortur(?:e|ed|ing)|gore)\b/i.test(sourceText)
    || /\b(?:sword|dagger|blade|knife)\b[^.?!]{0,80}\b(?:chest|body|neck|heart)\b/i.test(sourceText)
    || /\b(?:grabbed|clutched)\b[^.?!]{0,50}\bchest\b/i.test(sourceText);
}
