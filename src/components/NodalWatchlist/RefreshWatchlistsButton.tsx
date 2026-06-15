import { primaryActionButtonStyle } from "./watchlistButtonStyles";

type Props = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const RefreshWatchlistsButton = ({ onClick, disabled = false, loading = false }: Props) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      ...primaryActionButtonStyle,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {loading ? "Refreshing..." : "Refresh All Watchlists"}
  </button>
);

export default RefreshWatchlistsButton;
