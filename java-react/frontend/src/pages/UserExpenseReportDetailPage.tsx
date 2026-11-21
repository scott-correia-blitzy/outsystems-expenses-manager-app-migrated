import { useParams } from 'react-router';
import { ReportDetailView } from '../components/ReportDetailView';

export function UserExpenseReportDetailPage() {
  const { id } = useParams();
  return <ReportDetailView kind="expense" mode="owner" id={id} />;
}
