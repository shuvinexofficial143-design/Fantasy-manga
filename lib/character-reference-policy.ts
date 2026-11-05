import type {Character,Project} from "./types";

const BACKGROUND_ROLE=/\b(?:background|extras?|crowd|bystanders?|unnamed|anonymous|incidental|cameo|minor character|voice[- ]only|environment)\b|पृष्ठभूमि|भीड़|बैकग्राउंड|अनाम/i;
const NONVISUAL=/\b(?:voice[- ]only|disembodied|unseen|formless|inner voice|narrator|only a voice|no visible form)\b|केवल आवाज़|सिर्फ आवाज़/i;
const MAIN_ROLE=/\b(?:main|lead|protagonist|antagonist|hero|heroine|villain|central)\b|मुख्य|नायक|नायिका|खलनायक/i;
const GENERIC_NAME=/^(?:(?:knights?|guards?|soldiers?|servants?|villagers?|bystanders?|onlookers?|messengers?|attendants?|crowd|mob|people|mysterious (?:figure|shadow|voice)|unknown (?:figure|voice)|shadow|voice)(?:\s*(?:#?\d+|[ivx]+))?|(?:सैनिक|पहरेदार|भीड़|राहगीर|छाया)(?:\s*\d+)?)$/i;
export type CharacterReferencePlan={mode:"saved"|"four-view"|"scene";appearances:number;activeAppearances:number;reason:string};
/** Planned visual participation, not a count of name mentions in narration. */
export function characterReferencePlan(character:Character,project:Project):CharacterReferencePlan{
  const appearances=project.images.filter(scene=>scene.characterStates.some(state=>state.characterId===character.id));
  const activeAppearances=appearances.filter(scene=>scene.characterStates.some(state=>state.characterId===character.id&&!/background|पृष्ठभूमि|बैकग्राउंड/i.test(state.position))).length;
  const result={appearances:appearances.length,activeAppearances};
  if(character.referenceImage)return {...result,mode:"saved",reason:"Saved reference reuse होगी; दोबारा sheet नहीं बनेगी"};
  if(project.useContinuityReferences===false)return {...result,mode:"scene",reason:"Character/continuity references बंद हैं"};
  if(BACKGROUND_ROLE.test(character.role)||NONVISUAL.test(character.role+" "+character.appearance)||GENERIC_NAME.test(character.name)&&!MAIN_ROLE.test(character.role))return {...result,mode:"scene",reason:"Background/extra: अलग sheet नहीं; पहली scene आगे reference बनेगी"};
  if(appearances.length&&appearances.every(scene=>scene.image))return {...result,mode:"scene",reason:"Scenes तैयार हैं; आगे जरूरत पर पहली scene reuse होगी"};
  if(appearances.some(scene=>scene.reviewSession))return {...result,mode:"scene",reason:"पहले बनी image की pending review पूरी होगी; अभी references नहीं बदलेंगे"};
  if(activeAppearances>=2&&(MAIN_ROLE.test(character.role)&&appearances.length>=2||appearances.length>=3))return {...result,mode:"four-view",reason:"बार-बार सक्रिय character: जरूरत वाले scene से पहले automatic 4-view sheet बनेगी"};
  return {...result,mode:"scene",reason:"कम या background appearances: अलग sheet नहीं; पहली scene reuse होगी"};
}
