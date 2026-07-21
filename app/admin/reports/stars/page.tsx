import { AdminReportPage } from "../../admin-report-page";
export default function Page({ searchParams }: { searchParams?: Promise<{ start?: string; end?: string }> }) { return <AdminReportPage kind="stars" searchParams={searchParams}/>; }
