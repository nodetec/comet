import { useQuery } from '@tanstack/react-query';
import { getSyncStatus, getSyncInfo } from '../api/bridge';

export function useSyncStatus() {
  return useQuery({
    queryKey: ['sync-status'],
    queryFn: () => getSyncStatus(),
    refetchInterval: 5000,
  });
}

export function useSyncInfo() {
  return useQuery({
    queryKey: ['sync-info'],
    queryFn: () => getSyncInfo(),
    refetchInterval: 10000,
  });
}
