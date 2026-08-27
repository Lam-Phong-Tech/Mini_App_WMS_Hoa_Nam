import { useNavigate } from "react-router-dom";
import { Avatar, Button, Spinner, Text, useSnackbar } from "zmp-ui";
import { copy } from "@/constants/copy";
import {
  ChevronRightIcon,
  ProfileUserIcon,
  VoucherIcon,
} from "@/components/common/vectors";
import { useZaloAuth } from "@/hooks/use-zalo-auth";

interface MenuItem {
  id: string;
  label: string;
  icon: JSX.Element;
  path: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const { staff, isLoading, isAuthorized } = useZaloAuth();

  const handleLogin = () => navigate("/auth/login");

  const menuItems: MenuItem[] = [
    {
      id: "1",
      label: copy.profile.personalProfile,
      icon: <ProfileUserIcon className="h-6 w-6" />,
      path: "/profile/personal-info",
    },
    {
      id: "2",
      label: copy.profile.customRequests,
      icon: <VoucherIcon className="h-6 w-6" />,
      path: "/custom-request/history",
    },
    {
      id: "3",
      label: copy.profile.vouchers,
      icon: <VoucherIcon className="h-6 w-6" />,
      path: "/profile/vouchers",
    },
    {
      id: "4",
      label: copy.profile.supportCenter,
      icon: <ProfileUserIcon className="h-6 w-6" />,
      path: "/profile/help",
    },
  ];

  const handleMenuClick = (item: MenuItem) => {
    if (item.path === "/custom-request/history") {
      navigate(item.path);
      return;
    }
    openSnackbar({
      text: copy.profile.featureDeveloping,
      type: "warning",
    });
  };

  return (
    <div className="flex h-full flex-col bg-elevation-01">
      <div className="px-4 py-4">
        <div className="flex flex-col items-center">
          {isLoading ? (
            <div className="mb-4">
              <Spinner />
            </div>
          ) : (
            <Avatar
              src={staff?.avatar_url || "https://h5.zadn.vn/static/images/avatar.png"}
              size={80}
              className="mb-4"
            />
          )}
          {isAuthorized && staff ? (
            <div className="text-xlarge-m text-text-primary">{staff.name}</div>
          ) : (
            !isLoading && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="text-xlarge-m text-text-primary">
                    {copy.profile.notLoggedIn}
                  </div>
                  <div className="text-xxsmall text-text-secondary">
                    {copy.profile.notLoggedInHint}
                  </div>
                </div>
                <Button
                  onClick={handleLogin}
                  className="rounded-full bg-primary px-6 py-2.5 text-small text-white active:bg-primary/50"
                >
                  Đăng nhập WMS
                </Button>
              </div>
            )
          )}
        </div>
      </div>

      <div className="mx-3.5 mt-3 flex flex-col gap-6 rounded-lg bg-white p-5">
        {menuItems.map((item: MenuItem) => {
          return (
            <div
              className="flex items-center justify-between"
              onClick={() => handleMenuClick(item)}
              key={item.id}
            >
              <div className="flex items-center gap-2 text-small">
                <div>{item.icon}</div>
                <div>{item.label}</div>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-text-disabled" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
