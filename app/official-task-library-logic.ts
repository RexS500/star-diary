import { CATEGORY_META, OFFICIAL_TASKS, TIME_SLOT_META, officialTaskSearchText, type OfficialTask, type OfficialTaskAgeGroup, type OfficialTaskCategory, type OfficialTaskTimeSlot } from "./official-task-library.ts";

export type OfficialTaskSort="flow"|"category"|"popular"|"age"|"stars_asc"|"stars_desc"|"difficulty_asc"|"difficulty_desc"|"newest"|"recommended"|"favorites";
export type OfficialTaskFilters={search:string;age:"all"|Exclude<OfficialTaskAgeGroup,"all">;category:"all"|OfficialTaskCategory;timeSlot:"all"|OfficialTaskTimeSlot;difficulty:0|1|2|3|4|5;recommendedOnly:boolean;favoritesOnly:boolean};
export const DEFAULT_OFFICIAL_TASK_FILTERS:OfficialTaskFilters={search:"",age:"all",category:"all",timeSlot:"all",difficulty:0,recommendedOnly:false,favoritesOnly:false};

const ageOrder:Record<OfficialTaskAgeGroup,number>={age_3_5:0,age_6_8:1,age_9_12:2,age_13_plus:3,all:4};
const tie=(a:OfficialTask,b:OfficialTask)=>a.sortOrder-b.sortOrder||a.title.localeCompare(b.title,"zh-TW");
export function filterOfficialTasks(tasks:OfficialTask[],filters:OfficialTaskFilters,favorites:Set<string>){
  const query=filters.search.normalize("NFKC").trim().toLocaleLowerCase("zh-TW");
  return tasks.filter(task=>task.enabled
    &&(!query||officialTaskSearchText(task).includes(query))
    &&(filters.age==="all"||task.ageGroups.includes("all")||task.ageGroups.includes(filters.age))
    &&(filters.category==="all"||task.category===filters.category)
    &&(filters.timeSlot==="all"||task.timeSlot===filters.timeSlot)
    &&(!filters.difficulty||task.difficulty===filters.difficulty)
    &&(!filters.recommendedOnly||task.isRecommended)
    &&(!filters.favoritesOnly||favorites.has(task.id)));
}
export function sortOfficialTasks(tasks:OfficialTask[],sort:OfficialTaskSort,favorites:Set<string>){
  return [...tasks].sort((a,b)=>{
    if(sort==="flow")return TIME_SLOT_META[a.timeSlot].order-TIME_SLOT_META[b.timeSlot].order||Number(b.isRecommended)-Number(a.isRecommended)||b.popularityScore-a.popularityScore||tie(a,b);
    if(sort==="category")return CATEGORY_META[a.category].label.localeCompare(CATEGORY_META[b.category].label,"zh-TW")||tie(a,b);
    if(sort==="popular")return b.popularityScore-a.popularityScore||tie(a,b);
    if(sort==="age")return Math.min(...a.ageGroups.map(group=>ageOrder[group]))-Math.min(...b.ageGroups.map(group=>ageOrder[group]))||tie(a,b);
    if(sort==="stars_asc"||sort==="stars_desc")return (a.suggestedStars-b.suggestedStars)*(sort==="stars_asc"?1:-1)||tie(a,b);
    if(sort==="difficulty_asc"||sort==="difficulty_desc")return (a.difficulty-b.difficulty)*(sort==="difficulty_asc"?1:-1)||tie(a,b);
    if(sort==="newest")return b.createdAt.localeCompare(a.createdAt)||tie(a,b);
    if(sort==="recommended")return Number(b.isRecommended)-Number(a.isRecommended)||tie(a,b);
    if(sort==="favorites")return Number(favorites.has(b.id))-Number(favorites.has(a.id))||tie(a,b);
    return tie(a,b);
  });
}
export function officialTaskResults(filters:OfficialTaskFilters,sort:OfficialTaskSort,favoriteIds:string[],tasks=OFFICIAL_TASKS){const favorites=new Set(favoriteIds);return sortOfficialTasks(filterOfficialTasks(tasks,filters,favorites),sort,favorites)}
