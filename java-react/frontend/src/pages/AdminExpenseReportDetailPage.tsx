import { useParams } from 'react-router';
import { ReportDetailView } from '../components/ReportDetailView';

export function AdminExpenseReportDetailPage() {
  const { id } = useParams();
  return <ReportDetailView kind="expense" mode="admin" id={id} />;
}
