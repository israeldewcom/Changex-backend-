export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    await Notification.updateMany({ userId: user._id, read: false }, { read: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

export const getUserBadges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Placeholder – implement badge logic if you have a Badge model
    res.json({ success: true, data: [] });
  } catch (err) {
    next(err);
  }
};
