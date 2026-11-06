import type {Character,Project} from "./types";

const BACKGROUND_ROLE=/\b(?:background|extras?|crowd|bystanders?|unnamed|anonymous|incidental|cameo|minor character|voice[- ]only|environment)\b|पृष्ठभूमि|भीड़|बैकग्राउंड|अनाम/i;
const NONVISUAL=/\b(?:voice[- ]only|disembodied|unseen|formless|inner voice|narrator|only a voice|no visible form)\b|केवल आवाज़|सिर्फ आवाज़/i;
const MAIN_ROLE=/\b(?:main|lead|protagonist|antagonist|hero|heroine|villain|central)\b|मुख्य|नायक|नायिका|खलनायक/i;
const GENERIC_NAME=/^(?:(?:knights?|guards?|soldiers?|servants?|villagers?|bystanders?|onlookers?|messengers?|attendants?|crowd|mob|people|mysterious (?:figure|shadow|voice)|unknown (?:figure|voice)|shadow|voice)(?:\s*(?:#?\d+|[ivx]+))?|(?:सैनिक|पहरेदार|भीड़|राहगीर|छाया)(?:\s*\d+)?)$/i;
/** A legacy image is not a reason to turn an incidental extra into an identity master. */
export function isIncidentalCharacter(character:Character){
  return BACKGROUND_ROLE.test(character.role)
    || NONVISUAL.test(character.role+" "+character.appearance)
    || (GENERIC_NAME.test(character.name)&&!MAIN_ROLE.test(character.role));
}
export type CharacterReferencePlan={mode:"saved"|"four-view"|"scene";appearances:number;activeAppearances:number;reason:string};
/** Planned visual participation, not a count of name mentions in narration. */
export function characterReferencePlan(character:Character,project:Project):CharacterReferencePlan{
  const appearances=project.images.filter(scene=>scene.characterStates.some(state=>state.characterId===character.id));
  const activeAppearances=appearances.filter(scene=>scene.characterStates.some(state=>state.characterId===character.id&&!/background|पृष्ठभूमि|बैकग्राउंड/i.test(state.position))).length;
  // Story-first policy: no automatic identity sheets, regardless of repeat count.
  // Existing user images remain saved in legacy data but are not generated,
  // regenerated or consumed by the automatic scene-first workflow.
  return {
    appearances:appearances.length,activeAppearances,mode:"scene",
    reason:character.referenceImage
      ?"पुरानी Reference सुरक्षित है; नई Images के लिए पिछली Generated Scenes इस्तेमाल होंगी"
      :"Text Identity + पुरानी Generated Scene Images; कोई अलग Character Sheet नहीं"
  };
}
