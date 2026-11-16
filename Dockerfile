# Deploy lên Render (Docker) hoặc bất kỳ nơi nào chạy container
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY UitWebDay.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
# Render cấp cổng qua biến PORT (Program.cs đọc biến này)
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "UitWebDay.dll"]
