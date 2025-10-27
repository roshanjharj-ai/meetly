export const formatDate = (isoString: string) => {
      return new Date(isoString).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
      });
  };