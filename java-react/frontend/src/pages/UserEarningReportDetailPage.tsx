import { useParams } from 'react-router';
import { ReportDetailView } from '../components/ReportDetailView';

export function UserEarningReportDetailPage() {
  const { id } = useParams();
  return <ReportDetailView kind="earning" mode="owner" id={id} />;
}
