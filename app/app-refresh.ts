export const APP_DATA_REFRESH_EVENT = "star-diary:refresh-data";

export type AppDataRefreshDetail = {
  tasks: Array<Promise<boolean>>;
};

export type AppRefreshResult = {
  status: "success" | "cancelled" | "error";
  message?: string;
};
