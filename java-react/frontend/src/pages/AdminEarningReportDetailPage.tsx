import { useParams } from 'react-router';
import { ReportDetailView } from '../components/ReportDetailView';

export function AdminEarningReportDetailPage() {
  const { id } = useParams();
  return <ReportDetailView kind="earning" mode="admin" id={id} />;
}
